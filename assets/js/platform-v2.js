(function(){
  if (window.__rwPlatformV2) return;
  window.__rwPlatformV2 = true;

  const LS_LANG = 'rw_lang';
  const CONTACT_ENDPOINT = String(window.RW_CONTACT_ENDPOINT || '').trim();
  const NL_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=51.4817&longitude=5.6611&current=temperature_2m,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m&daily=sunrise,sunset&timezone=Europe%2FAmsterdam&forecast_days=1';
  const WEATHER_CACHE_KEY = 'rw_nl_weather_v2';
  const WEATHER_REFRESH_MS = 15 * 60 * 1000;
  let weatherState = null;
  let weatherRequest = null;
  let weatherLastAttempt = 0;
  let weatherRefreshAllowedAt = Date.now() + 2500;
  let weatherRefreshScheduled = false;
  let contactRenderScheduled = false;
  let nativeWallEngineStarted = false;
  let nativeWallStartScheduled = false;
  let nativeWallFrame = 0;
  let nativeWallLastPaint = 0;
  let nativeWallVisible = true;
  let nativeWallResizeFrame = 0;
  let visualPerformanceKey = '';
  let visualPerformanceProfile = null;
  let visualPerformanceFrame = 0;
  let visualPerformanceBound = false;
  const visualPerformanceProfiles = {
    high:{ key:'high', className:'rw-v2-visual-high', wallFrameMs:95, wallDprCap:1.6, wallIdleMs:420, blinkDelayMultiplier:1.15, blinkEnabled:true, pointerTracking:true },
    balanced:{ key:'balanced', className:'rw-v2-visual-balanced', wallFrameMs:185, wallDprCap:1.25, wallIdleMs:720, blinkDelayMultiplier:2.1, blinkEnabled:true, pointerTracking:false },
    economy:{ key:'economy', className:'rw-v2-visual-economy', wallFrameMs:360, wallDprCap:1, wallIdleMs:1100, blinkDelayMultiplier:3.6, blinkEnabled:false, pointerTracking:false, wallCanvas:false }
  };
  function connectionInfo(){
    return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  }
  function isReducedMotion(){
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  }
  function computeVisualPerformanceKey(){
    const connection = connectionInfo();
    const effectiveType = String(connection?.effectiveType || '');
    const saveData = Boolean(connection?.saveData);
    const slowConnection = /(^|-)2g$|slow-2g/i.test(effectiveType);
    const compactViewport = Boolean(window.matchMedia?.('(max-width: 760px)')?.matches);
    const mediumViewport = Boolean(window.matchMedia?.('(max-width: 1180px)')?.matches);
    const lowMemory = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4;
    const lowCores = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4;
    const touchFirst = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
    if (isReducedMotion() || saveData || slowConnection || compactViewport) return 'economy';
    if (mediumViewport || lowMemory || lowCores || touchFirst) return 'balanced';
    return 'high';
  }
  function applyVisualPerformanceProfile(){
    const key = computeVisualPerformanceKey();
    const profile = visualPerformanceProfiles[key] || visualPerformanceProfiles.balanced;
    visualPerformanceProfile = profile;
    if (visualPerformanceKey !== key && document.body) {
      document.body.classList.remove(
        visualPerformanceProfiles.high.className,
        visualPerformanceProfiles.balanced.className,
        visualPerformanceProfiles.economy.className
      );
      document.body.classList.add(profile.className);
      document.body.dataset.rwVisualQuality = key;
      visualPerformanceKey = key;
    }
    return profile;
  }
  function currentVisualPerformanceProfile(){
    return visualPerformanceProfile || applyVisualPerformanceProfile();
  }
  function queueVisualPerformanceProfile(){
    if (visualPerformanceFrame) return;
    visualPerformanceFrame = window.requestAnimationFrame(() => {
      visualPerformanceFrame = 0;
      const previous = visualPerformanceKey;
      const profile = applyVisualPerformanceProfile();
      if (previous !== profile.key) scheduleNativeWallCanvasStart();
    });
  }
  function bindVisualPerformanceGovernor(){
    if (visualPerformanceBound) return;
    visualPerformanceBound = true;
    applyVisualPerformanceProfile();
    window.addEventListener('resize', queueVisualPerformanceProfile, { passive:true });
    window.addEventListener('orientationchange', queueVisualPerformanceProfile, { passive:true });
    document.addEventListener('visibilitychange', queueVisualPerformanceProfile);
    connectionInfo()?.addEventListener?.('change', queueVisualPerformanceProfile);
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (motionQuery?.addEventListener) motionQuery.addEventListener('change', queueVisualPerformanceProfile);
    else motionQuery?.addListener?.(queueVisualPerformanceProfile);
  }
  const modules = [
    { match:'Contract Budget Calculator', icon:'calculator', category:'finance',
      title:{pl:'Kalkulator budżetu kontraktu', en:'Contract Budget Calculator', nl:'Contractbudget calculator'},
      desc:{pl:'Szybka estymacja budżetu i kosztów kontraktu.', en:'Fast contract budget and cost estimation.', nl:'Snelle raming van contractbudget en kosten.'}},
    { match:'New Bill Rate', icon:'rate', category:'finance',
      title:{pl:'Nowa stawka Bill Rate', en:'New Bill Rate', nl:'Nieuw bill rate'},
      desc:{pl:'Kalkulacja marży, kosztu i stawki sprzedażowej.', en:'Calculate margin, cost, and client billing rate.', nl:'Bereken marge, kostprijs en klanttarief.'}},
    { match:['Urządzenie kalkulacyjne', 'Calculation Tool', 'Calculation device', 'Calculatietool', 'Rekeninstrument', 'Rekentool', 'RekenTool Master'], icon:'tool', category:'finance',
      title:{pl:'RekenTool Master', en:'RekenTool Master', nl:'RekenTool Master'},
      desc:{pl:'Główny moduł kalkulacyjny RekenTool do codziennej pracy.', en:'Main RekenTool calculator module for everyday operations.', nl:'Hoofdmodule van RekenTool voor dagelijks werk.'}},
    { match:'Intake Call', icon:'call', category:'recruitment',
      title:{pl:'Intake Call', en:'Intake Call', nl:'Intakegesprek'},
      desc:{pl:'Strukturyzuje rozmowę intake i wymagania roli.', en:'Structure intake calls and role requirements.', nl:'Structureer intakegesprekken en functie-eisen.'}},
    { match:'Ocena dopasowania CV', icon:'cv', category:'recruitment',
      title:{pl:'Ocena dopasowania CV', en:'CV Match Review', nl:'CV-match beoordeling'},
      desc:{pl:'Porównanie CV z opisem stanowiska i wymaganiami.', en:'Compare a CV against role requirements.', nl:'Vergelijk een CV met functie-eisen.'}},
    { match:['MSD Calculator', 'MSD CAO Salary Check', 'CAO Salary Check'], icon:'tool', category:'finance',
      title:{pl:'MSD Calculator', en:'MSD Calculator', nl:'MSD Calculator'},
      desc:{pl:'Zwykły kalkulator do własnych obliczeń.', en:'Standard calculator for your own calculations.', nl:'Standaardcalculator voor eigen berekeningen.'}},
    { match:['MSD CAO', 'Merit increase'], icon:'document', category:'documents',
      title:{pl:'Merit increase 2026', en:'Merit increase 2026', nl:'Merit increase 2026'},
      desc:{pl:'Kalkulator merit increase z wyraźnym wyborem roku.', en:'Merit increase calculator with clear year selection.', nl:'Merit increase calculator met duidelijke jaarkeuze.'}},
    { match:'Merit Excel 350', icon:'document', category:'documents',
      title:{pl:'Merit Excel 350', en:'Merit Excel 350', nl:'Merit Excel 350'},
      desc:{pl:'Excel workbook for 350 merit rows with automatic GS/PS markup.', en:'Excel workbook for 350 merit rows with automatic GS/PS markup.', nl:'Excel workbook for 350 merit rows with automatic GS/PS markup.'}},
    { match:'Przegląd agencji', icon:'agency', category:'documents',
      title:{pl:'Przegląd agencji', en:'Agency Review', nl:'Bureauoverzicht'},
      desc:{pl:'Porządkowanie informacji o agencjach i partnerach.', en:'Organize agency and partner information.', nl:'Orden informatie over bureaus en partners.'}},
    { match:'Rejestr spotkań', icon:'meeting', category:'tracking',
      title:{pl:'Rejestr spotkań z managerami', en:'Manager Meeting Tracker', nl:'Managergesprekken register'},
      desc:{pl:'Rejestruj spotkania, statusy i ustalenia.', en:'Track meetings, statuses, and follow-ups.', nl:'Registreer gesprekken, status en afspraken.'}},
    { match:'Home Office Tracker', icon:'home', category:'tracking',
      title:{pl:'Licznik pracy z domu', en:'Home Office Tracker', nl:'Thuiswerk tracker'},
      desc:{pl:'Liczenie dni pracy z domu, biura i nieobecności.', en:'Track home, office, and non-working days.', nl:'Tel thuiswerk-, kantoor- en vrije dagen.'}},
    { match:'Redukcja', icon:'tracker', category:'tracking',
      title:{pl:'Redukcja', en:'Reduction', nl:'Reductie'},
      desc:{pl:'Kontrola redukcji, tygodniowego bilansu i danych Garmin/Fitatu.', en:'Track reduction, weekly balance, and Garmin/Fitatu data.', nl:'Volg reductie, weekbalans en Garmin/Fitatu-gegevens.'}},
    { match:'My Projects', icon:'project', category:'projects',
      title:{pl:'Moje projekty', en:'My Projects', nl:'Mijn projecten'},
      desc:{pl:'Twoja przestrzeń na dokumenty, projekty i rozliczenia.', en:'Your workspace for projects, documents, and billing.', nl:'Je werkruimte voor projecten, documenten en facturatie.'}},
    { match:['RekenTool Professional & General Staffing', 'Rekentool Combined'], icon:'tool', category:'finance',
      title:{pl:'RekenTool Professional & General Staffing', en:'RekenTool Professional & General Staffing', nl:'RekenTool Professional & General Staffing'},
      desc:{pl:'Połączony RekenTool dla Professional Staffing i General Staffing.', en:'Combined RekenTool for Professional Staffing and General Staffing.', nl:'Gecombineerde RekenTool voor Professional Staffing en General Staffing.'}},
    { match:['RekenTool General Staffing', 'Rekentool General Staffing'], icon:'tool', category:'finance',
      title:{pl:'RekenTool General Staffing', en:'RekenTool General Staffing', nl:'RekenTool General Staffing'},
      desc:{pl:'Osobny RekenTool dla General Staffing.', en:'Separate RekenTool for General Staffing.', nl:'Aparte RekenTool voor General Staffing.'}},
    { match:['RekenTool Professional Staffing', 'Rekentool Professional Staffing'], icon:'tool', category:'finance',
      title:{pl:'RekenTool Professional Staffing', en:'RekenTool Professional Staffing', nl:'RekenTool Professional Staffing'},
      desc:{pl:'Osobny RekenTool dla Professional Staffing.', en:'Separate RekenTool for Professional Staffing.', nl:'Aparte RekenTool voor Professional Staffing.'}},
    { match:['RekenTool Payroll', 'Rekentool Pay roll', 'Rekentool Payroll'], icon:'tool', category:'finance',
      title:{pl:'RekenTool Payroll', en:'RekenTool Payroll', nl:'RekenTool Payroll'},
      desc:{pl:'Osobny RekenTool dla Payroll.', en:'Separate RekenTool for Payroll.', nl:'Aparte RekenTool voor Payroll.'}}
  ];
  const commandHotspots = [
    { id:'revenue', label:'Total revenue panel' },
    { id:'analytics', label:'Analytics panel' },
    { id:'kpi', label:'KPI panel' },
    { id:'table', label:'Monthly revenue panel' },
    { id:'calculations', label:'Calculations panel' },
    { id:'activity', label:'Global activity panel' },
    { id:'footer', label:'Footer links panel' }
  ];
  const legacyVisualStyleIds = [
    'rw-header-style',
    'platform-autumn-skin',
    'force-clean-ui',
    'remove-orange-frame-keep-layout',
    'remove-viewport-border',
    'force-no-border',
    'sticky-privacy-footer',
    'privacy-hide-helper',
    'rw-home-btn-transparent-orange-v5',
    'rw-home-button-style',
    'rw-home-override-orange',
    'rw-home-safe-area',
    'rw-fix-header-overlay',
    'rw-lang-style',
    'rw-brand-modern-final',
    'rw-ownership-mark-final',
    'rw-subtle-brand-final',
    'rw-futuristic-home-v16',
    'rw-futuristic-clean-v17',
    'rw-v18-active-visual',
    'rw-professional-final-v2',
    'rw-v20-molecular-visual',
    'rw-v21-fit-home-no-overlap',
    'rw-v22-composed-home',
    'rw-v24-single-card-accent',
    'rw-correct-platform-name',
    'rw-fullscreen-keyboard-bg-style',
    'rw-agent-hide-header-text',
    'rw-agent-buttons-relayout-fix',
    'rw-hide-auto-lang-text',
    'rw-futuristic-dock-style',
    'rw-professional-platform-v1',
    'rw-voice-agent-style'
  ];

  const categories = [
    { id:'all', label:{pl:'Wszystkie', en:'All', nl:'Alles'} },
    { id:'recruitment', label:{pl:'Rekrutacja', en:'Recruitment', nl:'Recruitment'} },
    { id:'finance', label:{pl:'Finanse', en:'Finance', nl:'Finance'} },
    { id:'documents', label:{pl:'Dokumenty', en:'Documents', nl:'Documenten'} },
    { id:'tracking', label:{pl:'Trackery', en:'Tracking', nl:'Tracking'} },
    { id:'projects', label:{pl:'Projekty', en:'Projects', nl:'Projecten'} }
  ];

  const copy = {
    eyebrow:{pl:'Platforma modułów pracy', en:'Work modules platform', nl:'Platform voor werkmodules'},
    headline:{pl:'Rafal Wilk Digital Workshop.', en:'Rafal Wilk Digital Workshop.', nl:'Rafal Wilk Digital Workshop.'},
    intro:{pl:'Prywatne centrum operacyjne.',
      en:'Private operations center.',
      nl:'Prive operationeel centrum.'},
    ownerNote:{pl:'Dostęp do modułów ma wyłącznie właściciel.',
      en:'Module access is reserved for the owner.',
      nl:'Moduletoegang is alleen voor de eigenaar.'},
    openFirst:{pl:'Otwórz pierwszy moduł', en:'Open first module', nl:'Open eerste module'},
    viewAll:{pl:'Pokaż wszystkie', en:'View all', nl:'Toon alles'},
    library:{pl:'Biblioteka modułów', en:'Module library', nl:'Modulebibliotheek'},
    librarySub:{pl:'Wybierz moduł lub kategorię.', en:'Choose a module or category.', nl:'Kies een module of categorie.'},
    protected:{pl:'Chronione moduły', en:'Protected modules', nl:'Beveiligde modules'},
    categories:{pl:'Kategorie', en:'Categories', nl:'Categorieën'},
    languages:{pl:'Języki', en:'Languages', nl:'Talen'},
    open:{pl:'Otwórz', en:'Open', nl:'Openen'},
    openPlatform:{pl:'Otwórz w platformie', en:'Open in platform', nl:'Openen in platform'},
    pinTitle:{pl:'Dostęp do modułu', en:'Protected module access', nl:'Beveiligde moduletoegang'},
    pinText:{pl:'Wpisz PIN, aby otworzyć wybrany moduł.', en:'Enter the PIN to open this module.', nl:'Voer de pincode in om deze module te openen.'},
    cancel:{pl:'Anuluj', en:'Cancel', nl:'Annuleren'},
    unlock:{pl:'Odblokuj', en:'Unlock', nl:'Ontgrendelen'},
    wrongPin:{pl:'Nieprawidłowy PIN. Spróbuj ponownie.', en:'Incorrect PIN. Try again.', nl:'Onjuiste pincode. Probeer opnieuw.'},
    back:{pl:'Powrót', en:'Back', nl:'Terug'},
    saved:{pl:'Autosave aktywny', en:'Autosave active', nl:'Autosave actief'},
    apiOn:{pl:'AI aktywne', en:'AI active', nl:'AI actief'},
    apiOff:{pl:'AI nieaktywne', en:'AI inactive', nl:'AI inactief'},
    contactTitle:{pl:'Kontakt', en:'Contact', nl:'Contact'},
    contactIntro:{pl:'W razie pytań lub zgłoszeń do platformy wyślij krótką wiadomość.', en:'For platform questions or requests, send a short message.', nl:'Stuur een kort bericht voor vragen of verzoeken over het platform.'},
    contactName:{pl:'Imię', en:'Name', nl:'Naam'},
    contactEmail:{pl:'Twój email', en:'Your email', nl:'Je e-mail'},
    contactMessage:{pl:'Wiadomość', en:'Message', nl:'Bericht'},
    contactSend:{pl:'Wyślij wiadomość', en:'Send message', nl:'Bericht verzenden'},
    contactSending:{pl:'Wysyłanie...', en:'Sending...', nl:'Verzenden...'},
    contactSent:{pl:'Twój mail został wysłany. Naciśnij OK, aby wrócić do startu.', en:'Your email has been sent. Press OK to return to start.', nl:'Je e-mail is verzonden. Druk op OK om terug te keren naar start.'},
    contactError:{pl:'Nie udało się wysłać wiadomości. Spróbuj ponownie za chwilę.', en:'The message could not be sent. Try again in a moment.', nl:'Het bericht kon niet worden verzonden. Probeer het later opnieuw.'},
    contactFallback:{pl:'Formularz serwerowy nie jest jeszcze aktywny. Otwieram gotową wiadomość email.', en:'The server contact form is not active yet. Opening a prepared email message.', nl:'Het serverformulier is nog niet actief. Ik open een voorbereide e-mail.'}
  };

  const iconSvg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const icons = {
    calculator:iconSvg('<rect x="6" y="3.5" width="12" height="17" rx="2.4"/><path d="M8.8 7.3h6.4M9 11h.1M12 11h.1M15 11h.1M9 14.5h.1M12 14.5h.1M15 14.5h.1M9 18h6"/>'),
    rate:iconSvg('<path d="M4.5 19.5V5.2"/><path d="M4.5 19.5h15"/><path d="m7.2 15.5 3.8-4 3.1 2.6 4.7-7.2"/><path d="M16.2 6.9h2.6v2.7"/>'),
    tool:iconSvg('<path d="M14.8 6.2a4.2 4.2 0 0 0-5.1 5.1L4.4 16.6v3h3l5.3-5.3a4.2 4.2 0 0 0 5.1-5.1l-2.9 2.9-2-2 2.9-2.9Z"/><path d="M6.2 18.1h.1"/>'),
    call:iconSvg('<path d="M20.7 16.7v2.6a1.9 1.9 0 0 1-2.1 1.9 18 18 0 0 1-7.7-2.8 17.6 17.6 0 0 1-5.4-5.4 18 18 0 0 1-2.8-7.8 1.9 1.9 0 0 1 1.9-2h2.7a1.8 1.8 0 0 1 1.8 1.5c.1.8.3 1.5.5 2.2a1.9 1.9 0 0 1-.4 2L8 10a14.3 14.3 0 0 0 6 6l1.1-1.1a1.9 1.9 0 0 1 2-.4c.7.2 1.5.4 2.3.5a1.8 1.8 0 0 1 1.3 1.7Z"/>'),
    cv:iconSvg('<path d="M7 3.2h7.3L19 7.9v12.9H7a2 2 0 0 1-2-2V5.2a2 2 0 0 1 2-2Z"/><path d="M14 3.5V8h4.5"/><path d="M8.5 12.5h7M8.5 16h5.2"/>'),
    scan:iconSvg('<path d="M4.5 8V5.6a1.1 1.1 0 0 1 1.1-1.1H8M16 4.5h2.4a1.1 1.1 0 0 1 1.1 1.1V8M19.5 16v2.4a1.1 1.1 0 0 1-1.1 1.1H16M8 19.5H5.6a1.1 1.1 0 0 1-1.1-1.1V16"/><path d="M7.5 12h9"/>'),
    document:iconSvg('<path d="M7 3.2h7.4L19 7.8v13H7a2 2 0 0 1-2-2V5.2a2 2 0 0 1 2-2Z"/><path d="M14 3.5V8h4.5"/><path d="M8.5 12.7h6.8M8.5 16.2h6.8"/>'),
    agency:iconSvg('<path d="M3.5 20.5h17"/><path d="M5.5 20.5V8l6.5-4.2L18.5 8v12.5"/><path d="M9 20.5v-6h6v6"/><path d="M8.6 9.6h.1M15.3 9.6h.1"/>'),
    meeting:iconSvg('<rect x="4" y="4.6" width="16" height="15.4" rx="2.2"/><path d="M8.2 3v4M15.8 3v4M4 9.4h16"/><path d="M8 13.4h4.5M8 16.8h7"/>'),
    home:iconSvg('<path d="m3.8 11.2 8.2-7.3 8.2 7.3"/><path d="M6 10.5v9.2h12v-9.2"/><path d="M9.2 19.7v-5.6h5.6v5.6"/>'),
    project:iconSvg('<path d="M3.8 7.2h6.7l1.9 2h7.8v9.6a2 2 0 0 1-2 2H5.8a2 2 0 0 1-2-2Z"/><path d="M3.8 7.2V5.4a2 2 0 0 1 2-2h3.7l1.9 1.9h3.5"/>')
  };

  let activeFilter = 'all';
  let activeModuleTitle = '';
  let activeLangOverride = null;

  function lang(){
    let stored = '';
    try { stored = localStorage.getItem(LS_LANG) || ''; } catch(_e) {}
    const raw = String(activeLangOverride || stored || document.documentElement.lang || 'pl').toLowerCase();
    if (raw.startsWith('en')) return 'en';
    if (raw.startsWith('nl')) return 'nl';
    return 'pl';
  }
  function markLanguageSwitch(){
    if (document.body.classList.contains('app-open')) return;
    document.body.classList.add('rw-v2-language-switching');
    clearTimeout(window.__rwV2LanguageSwitchTimer);
    window.__rwV2LanguageSwitchTimer = setTimeout(() => {
      document.body.classList.remove('rw-v2-language-switching');
    }, 520);
  }
  function setPlatformLang(nextLang){
    markLanguageSwitch();
    activeLangOverride = String(nextLang || 'pl').toLowerCase().slice(0, 2);
    if (!['pl', 'en', 'nl'].includes(activeLangOverride)) activeLangOverride = 'pl';
    try {
      localStorage.setItem(LS_LANG, activeLangOverride);
      localStorage.setItem('doc_lang', activeLangOverride);
      localStorage.setItem('supplier_lang', activeLangOverride);
    } catch(_e) {}
    document.documentElement.lang = activeLangOverride;
    syncLegacyLangButtons(activeLangOverride);
    pushLanguageToModules(activeLangOverride);
    try { window.dispatchEvent(new CustomEvent('rwLanguageChanged', { detail:{ lang:activeLangOverride } })); } catch(_e) {}
    scheduleLanguagePush(activeLangOverride);
  }
  function t(key){ return copy[key]?.[lang()] || copy[key]?.pl || key; }
  function uiText(key){
    const texts = {
      command:{pl:'Szukaj', en:'Command', nl:'Zoeken'},
      commandTitle:{pl:'Command Center', en:'Command Center', nl:'Command Center'},
      commandHint:{pl:'Wpisz nazwę modułu', en:'Type a module name', nl:'Typ een modulenaam'},
      commandEmpty:{pl:'Brak wyników', en:'No results', nl:'Geen resultaten'},
      systemOnline:{pl:'System online', en:'System online', nl:'Systeem online'},
      quickAccess:{pl:'Szybki dostęp', en:'Quick access', nl:'Snelle toegang'},
      protected:{pl:'Chroniony', en:'Protected', nl:'Beveiligd'},
      ready:{pl:'Gotowy', en:'Ready', nl:'Gereed'},
      calculator:{pl:'Kalkulator', en:'Calculator', nl:'Rekentool'},
      document:{pl:'Dokument', en:'Document', nl:'Document'},
      workbook:{pl:'Excel', en:'Excel', nl:'Excel'},
      workflow:{pl:'Proces', en:'Workflow', nl:'Workflow'},
      tracker:{pl:'Tracker', en:'Tracker', nl:'Tracker'}
    };
    return texts[key]?.[lang()] || texts[key]?.pl || key;
  }
  function moduleTitle(meta){
    return meta?.title?.[lang()] || meta?.title?.pl || '';
  }
  function categoryLabel(id){
    const found = categories.find((item) => item.id === id);
    return found?.label?.[lang()] || found?.label?.pl || id || '';
  }
  function moduleStatus(meta){
    const title = `${moduleTitle(meta)} ${Array.isArray(meta?.match) ? meta.match.join(' ') : meta?.match || ''}`.toLowerCase();
    if (meta?.category === 'projects') return uiText('protected');
    if (title.includes('excel')) return uiText('workbook');
    if (meta?.category === 'finance') return uiText('calculator');
    if (meta?.category === 'documents') return uiText('document');
    if (meta?.category === 'tracking') return uiText('tracker');
    if (meta?.category === 'recruitment') return uiText('workflow');
    return uiText('ready');
  }
  function searchText(meta, title){
    const matches = Array.isArray(meta?.match) ? meta.match : [meta?.match || ''];
    const titles = Object.values(meta?.title || {});
    const descs = Object.values(meta?.desc || {});
    const keywords = {
      finance:'finance budget bill rate margin rate calculator rekentool calculation cao salary pay',
      recruitment:'recruitment intake call cv match candidate job',
      documents:'document file workbook excel report pdf',
      tracking:'tracker register meeting manager home office days',
      projects:'project private protected files'
    }[meta?.category] || '';
    return `${title} ${titles.join(' ')} ${descs.join(' ')} ${matches.join(' ')} ${categoryLabel(meta?.category)} ${moduleStatus(meta)} ${keywords}`.toLowerCase();
  }
  function syncHomeLang(){
    document.querySelectorAll('[data-rw-home-lang]').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.rwHomeLang === lang() ? 'true' : 'false');
    });
  }
  function syncLegacyLangButtons(nextLang){
    const current = normalizePlatformLang(nextLang || lang());
    document.querySelectorAll('.rw-lang-btn').forEach((btn) => {
      const active = normalizePlatformLang(btn.dataset.lang || '') === current;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.classList.toggle('active', active);
    });
  }
  function normalizePlatformLang(value){
    const raw = String(value || '').toLowerCase().slice(0, 2);
    return ['pl', 'en', 'nl'].includes(raw) ? raw : 'pl';
  }
  function pushLanguageToModules(nextLang){
    const requestedLang = normalizePlatformLang(nextLang || lang());
    if (typeof window.__rwPushLang === 'function') {
      window.__rwPushLang(requestedLang);
      return;
    }
    document.querySelectorAll('iframe').forEach((frame) => {
      try {
        frame.contentWindow?.postMessage({ type:'rw:setLang', lang:requestedLang }, '*');
      } catch(_e) {}
    });
  }
  function scheduleLanguagePush(nextLang){
    const requestedLang = normalizePlatformLang(nextLang || lang());
    [0, 80, 360, 900].forEach((delay) => {
      setTimeout(() => pushLanguageToModules(requestedLang), delay);
    });
  }
  function findMeta(card){
    const storedIndex = Number(card?.dataset?.rwModuleIndex);
    if (Number.isInteger(storedIndex) && modules[storedIndex]) return modules[storedIndex];
    const title = card.querySelector('.title');
    const key = title?.dataset.titleKey || title?.textContent || '';
    const foundIndex = modules.findIndex((m) => {
      const matches = Array.isArray(m.match) ? m.match : [m.match];
      return matches.some((match) => key.includes(match) || String(title?.textContent || '').includes(match));
    });
    const nextIndex = foundIndex >= 0 ? foundIndex : 0;
    if (card) card.dataset.rwModuleIndex = String(nextIndex);
    return modules[nextIndex];
  }
  function syncBrand(){
    document.querySelectorAll('.rw-brand-main').forEach((el) => {
      el.textContent = 'Rafal Wilk AI';
    });
    document.querySelectorAll('.rw-title').forEach((el) => {
      el.setAttribute('aria-label', 'Rafal Wilk AI');
    });
    document.title = 'Rafal Wilk AI';
  }
  function retireLegacyVisualLayers(){
    legacyVisualStyleIds.forEach((id) => {
      const style = document.getElementById(id);
      if (!style || style.dataset.rwRetired === 'true') return;
      style.dataset.rwRetired = 'true';
      style.setAttribute('media', 'not all');
      style.disabled = true;
    });
  }
  function ensureShell(){
    const main = document.querySelector('main.wrap');
    const grid = main?.querySelector('.grid');
    if (!main || !grid) return;
    let shell = main.querySelector('.rw-v2-shell');
    if (!shell) {
      shell = document.createElement('div');
      shell.className = 'rw-v2-shell';
      const hero = document.createElement('section');
      hero.className = 'rw-v2-hero';
      const toolbar = document.createElement('section');
      toolbar.className = 'rw-v2-toolbar';
      main.insertBefore(shell, grid);
      shell.append(hero, toolbar, grid);
    }
    if (!shell.querySelector('.rw-v2-contact')) {
      const contact = document.createElement('section');
      contact.className = 'rw-v2-contact';
      shell.appendChild(contact);
    }
    if (!shell.querySelector('.rw-v2-hotspots')) {
      const hotspots = document.createElement('div');
      hotspots.className = 'rw-v2-hotspots';
      hotspots.setAttribute('aria-hidden', 'true');
      hotspots.innerHTML = commandHotspots.map((item) =>
        `<button type="button" class="rw-v2-hotspot rw-v2-hotspot-${item.id}" data-rw-hotspot="${item.id}" title="${item.label}"></button>`
      ).join('');
      shell.appendChild(hotspots);
    }
    if (!shell.querySelector('.rw-v2-floating-lang')) {
      const langControls = document.createElement('div');
      langControls.className = 'rw-v2-floating-lang';
      langControls.setAttribute('role', 'group');
      langControls.setAttribute('aria-label', 'Language');
      langControls.innerHTML = '<button type="button" data-rw-home-lang="pl">PL</button><button type="button" data-rw-home-lang="en">EN</button><button type="button" data-rw-home-lang="nl">NL</button>';
      shell.appendChild(langControls);
    }
    shell.querySelectorAll('.rw-v2-domain-hud').forEach((domainHud) => domainHud.remove());
    if (!shell.querySelector('.rw-v2-native-wall-canvas')) {
      const wallCanvas = document.createElement('canvas');
      wallCanvas.className = 'rw-v2-native-wall-canvas';
      wallCanvas.setAttribute('aria-hidden', 'true');
      shell.appendChild(wallCanvas);
    }
    if (!shell.querySelector('.rw-v2-ai-global-grade')) {
      const globalGrade = document.createElement('div');
      globalGrade.className = 'rw-v2-ai-global-grade';
      globalGrade.setAttribute('aria-hidden', 'true');
      shell.appendChild(globalGrade);
    }
    if (!shell.querySelector('.rw-v2-face-neural-link')) {
      const faceNeuralLink = document.createElement('div');
      faceNeuralLink.className = 'rw-v2-face-neural-link';
      faceNeuralLink.setAttribute('aria-hidden', 'true');
      shell.appendChild(faceNeuralLink);
    }
    document.body.classList.add('rw-v2-video-face-mode');
    if (!shell.querySelector('.rw-v2-face-bg-mask')) {
      const faceMask = document.createElement('div');
      faceMask.className = 'rw-v2-face-bg-mask';
      faceMask.setAttribute('aria-hidden', 'true');
      shell.appendChild(faceMask);
    }
    shell.querySelectorAll('.rw-v2-assistant-face-cutout, .rw-v2-assistant-face-canvas, .rw-v2-assistant-blink').forEach((oldFaceLayer) => oldFaceLayer.remove());
    if (!shell.querySelector('.rw-v2-assistant-face-shadow')) {
      const assistantShadow = document.createElement('div');
      assistantShadow.className = 'rw-v2-assistant-face-shadow';
      assistantShadow.setAttribute('aria-hidden', 'true');
      shell.appendChild(assistantShadow);
    }
    if (!shell.querySelector('.rw-v2-assistant-face-plate')) {
      const assistantPlate = document.createElement('div');
      assistantPlate.className = 'rw-v2-assistant-face-plate';
      assistantPlate.setAttribute('aria-hidden', 'true');
      shell.appendChild(assistantPlate);
    }
    if (!shell.querySelector('.rw-v2-assistant-face-halo')) {
      const assistantHalo = document.createElement('div');
      assistantHalo.className = 'rw-v2-assistant-face-halo';
      assistantHalo.setAttribute('aria-hidden', 'true');
      shell.appendChild(assistantHalo);
    }
    if (!shell.querySelector('.rw-v2-assistant-face-depth')) {
      const assistantDepth = document.createElement('div');
      assistantDepth.className = 'rw-v2-assistant-face-depth';
      assistantDepth.setAttribute('aria-hidden', 'true');
      shell.appendChild(assistantDepth);
    }
    if (!shell.querySelector('.rw-v2-assistant-face-rim')) {
      const assistantRim = document.createElement('div');
      assistantRim.className = 'rw-v2-assistant-face-rim';
      assistantRim.setAttribute('aria-hidden', 'true');
      shell.appendChild(assistantRim);
    }
    if (!shell.querySelector('.rw-v2-assistant-face-video')) {
      const assistantFaceVideo = document.createElement('video');
      assistantFaceVideo.className = 'rw-v2-assistant-face-video';
      assistantFaceVideo.setAttribute('aria-hidden', 'true');
      assistantFaceVideo.muted = true;
      assistantFaceVideo.loop = true;
      assistantFaceVideo.autoplay = true;
      assistantFaceVideo.playsInline = true;
      assistantFaceVideo.preload = 'auto';
      assistantFaceVideo.setAttribute('muted', '');
      assistantFaceVideo.setAttribute('loop', '');
      assistantFaceVideo.setAttribute('autoplay', '');
      assistantFaceVideo.setAttribute('playsinline', '');
      assistantFaceVideo.setAttribute('preload', 'auto');
      shell.appendChild(assistantFaceVideo);
    }
    if (!shell.querySelector('.rw-v2-assistant-mouth-sync')) {
      const assistantMouth = document.createElement('div');
      assistantMouth.className = 'rw-v2-assistant-mouth-sync';
      assistantMouth.setAttribute('aria-hidden', 'true');
      assistantMouth.innerHTML = '<span class="rw-v2-mouth-core"></span><span class="rw-v2-mouth-upper"></span><span class="rw-v2-mouth-lower"></span><span class="rw-v2-mouth-glint"></span>';
      shell.appendChild(assistantMouth);
    }
    shell.querySelectorAll('.rw-v2-assistant-voice').forEach((assistantVoice) => assistantVoice.remove());
    shell.querySelectorAll('.rw-v2-voice-unlock').forEach((voiceUnlock) => voiceUnlock.remove());
    if (!shell.querySelector('.rw-v2-ambient-deck')) {
      const deck = document.createElement('div');
      deck.className = 'rw-v2-ambient-deck';
      deck.setAttribute('aria-hidden', 'true');
      deck.innerHTML = '<span class="rw-v2-deck-ring"></span><span class="rw-v2-deck-ring"></span><span class="rw-v2-deck-core"></span><span class="rw-v2-deck-scan"></span><span class="rw-v2-deck-route"></span><span class="rw-v2-deck-route"></span><span class="rw-v2-deck-route"></span><span class="rw-v2-deck-node"></span><span class="rw-v2-deck-node"></span><span class="rw-v2-deck-node"></span><span class="rw-v2-deck-node"></span>';
      shell.appendChild(deck);
    }
    if (!shell.querySelector('.rw-v2-daylight-system')) {
      const daylight = document.createElement('div');
      daylight.className = 'rw-v2-daylight-system';
      daylight.setAttribute('aria-hidden', 'true');
      daylight.innerHTML = '<span class="rw-v2-sky-wash"></span><span class="rw-v2-live-clouds"></span><span class="rw-v2-live-stars"></span><span class="rw-v2-live-moon"></span><span class="rw-v2-live-sun"></span><span class="rw-v2-live-rain"></span><span class="rw-v2-window-reflection"></span>';
      shell.appendChild(daylight);
    }
    if (!shell.querySelector('.rw-v2-floor-signature')) {
      const signature = document.createElement('div');
      signature.className = 'rw-v2-floor-signature';
      signature.setAttribute('aria-hidden', 'true');
      signature.innerHTML = '<span>Rafal Wilk AI</span>';
      shell.appendChild(signature);
    }
    if (!shell.querySelector('.rw-v2-console-signature')) {
      const consoleSignature = document.createElement('div');
      consoleSignature.className = 'rw-v2-console-signature';
      consoleSignature.setAttribute('aria-hidden', 'true');
      consoleSignature.innerHTML = '<span class="rw-v2-console-seal">AI</span><span class="rw-v2-console-name">Rafal Wilk AI</span>';
      shell.appendChild(consoleSignature);
    }
    shell.querySelectorAll('.rw-v2-table-signature').forEach((tableSignature) => tableSignature.remove());
    shell.querySelectorAll('.rw-v2-window-sun,.rw-v2-window-moon,.rw-v2-city-lights').forEach((el) => el.remove());
    if (!shell.querySelector('.rw-v2-depth-field')) {
      const depth = document.createElement('div');
      depth.className = 'rw-v2-depth-field';
      depth.setAttribute('aria-hidden', 'true');
      depth.innerHTML = '<span></span><span></span><span></span><span></span><span></span>';
      shell.appendChild(depth);
    }
    if (!shell.querySelector('.rw-v2-wall-clock')) {
      const clock = document.createElement('div');
      clock.className = 'rw-v2-wall-clock';
      clock.setAttribute('aria-hidden', 'true');
      clock.innerHTML = '<span class="rw-v2-wall-clock-kicker">LOCAL // TIME</span><span class="rw-v2-wall-clock-time"></span><span class="rw-v2-wall-clock-date"></span>';
      shell.appendChild(clock);
    }
    let trigger = document.querySelector('.rw-v2-command-trigger');
    if (!trigger) {
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'rw-v2-command-trigger';
      trigger.setAttribute('data-rw-command-open', 'true');
      document.body.appendChild(trigger);
    } else if (trigger.parentElement !== document.body) {
      document.body.appendChild(trigger);
    }
    if (!shell.querySelector('.rw-v2-system-strip')) {
      const strip = document.createElement('div');
      strip.className = 'rw-v2-system-strip';
      strip.setAttribute('aria-hidden', 'true');
      shell.appendChild(strip);
    }
    if (!shell.querySelector('.rw-v2-transition-veil')) {
      const veil = document.createElement('div');
      veil.className = 'rw-v2-transition-veil';
      veil.setAttribute('aria-hidden', 'true');
      veil.innerHTML = '<span></span><span></span><span></span>';
      shell.appendChild(veil);
    }
    if (!shell.querySelector('.rw-v2-command-palette')) {
      const palette = document.createElement('div');
      palette.className = 'rw-v2-command-palette';
      palette.setAttribute('hidden', '');
      palette.innerHTML = `<div class="rw-v2-command-dialog" role="dialog" aria-modal="true">
        <div class="rw-v2-command-head">
          <strong></strong>
          <button type="button" data-rw-command-close="true" aria-label="Close">x</button>
        </div>
        <input class="rw-v2-command-input" type="search" autocomplete="off">
        <div class="rw-v2-command-list" role="listbox"></div>
      </div>`;
      shell.appendChild(palette);
    }
    startAssistantBlink(shell);
    startAssistantVoice(shell);
  }

  function startAssistantVoice(shell){
    const mouth = shell?.querySelector('.rw-v2-assistant-mouth-sync');
    if (!mouth || mouth.dataset.rwVoiceActive === 'true') return;
    mouth.dataset.rwVoiceActive = 'true';
    mouth.dataset.rwVoiceState = 'disabled';
    window.__rwAssistantVoiceState = 'disabled';
    window.__rwAssistantMouthCueMap = null;
    document.body.classList.remove('rw-v2-assistant-speaking', 'rw-v2-assistant-presence', 'rw-v2-assistant-voice-blocked');
    mouth.style.setProperty('--rw-mouth-open', '0.000');
    mouth.style.setProperty('--rw-mouth-gap', '0.00px');
    mouth.style.setProperty('--rw-mouth-height', '1.30px');
    mouth.style.setProperty('--rw-mouth-wide', '1.000');
    mouth.style.setProperty('--rw-mouth-alpha', '0.120');
    mouth.style.setProperty('--rw-mouth-line-alpha', '0.240');
    mouth.style.setProperty('--rw-mouth-glint-alpha', '0.080');
    mouth.style.setProperty('--rw-mouth-upper-shift', '0.00px');
    mouth.style.setProperty('--rw-mouth-lower-shift', '0.00px');
  }

  function startAssistantBlink(shell){
    const blink = shell?.querySelector('.rw-v2-assistant-blink');
    const faceShadow = shell?.querySelector('.rw-v2-assistant-face-shadow');
    const facePlate = shell?.querySelector('.rw-v2-assistant-face-plate');
    const faceHalo = shell?.querySelector('.rw-v2-assistant-face-halo');
    const faceDepth = shell?.querySelector('.rw-v2-assistant-face-depth');
    const faceRim = shell?.querySelector('.rw-v2-assistant-face-rim');
    const faceCutout = shell?.querySelector('.rw-v2-assistant-face-cutout');
    const faceVideo = shell?.querySelector('.rw-v2-assistant-face-video');
    const faceCanvas = shell?.querySelector('.rw-v2-assistant-face-canvas');
    const faceMouth = shell?.querySelector('.rw-v2-assistant-mouth-sync');
    const faceNeuralLink = shell?.querySelector('.rw-v2-face-neural-link');
    const activeFaceNode = faceVideo || blink;
    if (!activeFaceNode || activeFaceNode.dataset.rwBlinkActive === 'true') return;
    activeFaceNode.dataset.rwBlinkActive = 'true';
    if (!faceVideo) return;
    if (!faceCanvas && !faceVideo) return;
    const natural = { width: 1704, height: 923 };
    const faceCrop = { x: 58, y: 54, width: 446, height: 562 };
    let hideTimer = 0;
    let blinkAnimFrame = 0;
    let raf = 0;
    let blinkStartedAt = 0;
    let blinkDuration = 0;
    let blinkDone = null;
    let blinkActive = false;
    const randomBetween = (min, max) => min + Math.random() * (max - min);
    const canvasCtx = faceCanvas?.getContext?.('2d', { alpha:true });
    const easeInOut = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
    const updateVideoGeometry = () => {
      const rect = shell.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const scale = Math.max(rect.width / natural.width, rect.height / natural.height);
      const renderedWidth = natural.width * scale;
      const renderedHeight = natural.height * scale;
      const offsetX = (rect.width - renderedWidth) / 2;
      const offsetY = (rect.height - renderedHeight) / 2;
      [faceShadow, facePlate, faceHalo, faceDepth, faceRim, faceCutout, faceVideo, faceCanvas, faceMouth, faceNeuralLink].forEach((faceLayer) => {
        if (!faceLayer) return;
        faceLayer.style.setProperty('--rw-face-left', `${offsetX + faceCrop.x * scale}px`);
        faceLayer.style.setProperty('--rw-face-top', `${offsetY + faceCrop.y * scale}px`);
        faceLayer.style.setProperty('--rw-face-width', `${faceCrop.width * scale}px`);
        faceLayer.style.setProperty('--rw-face-height', `${faceCrop.height * scale}px`);
      });
    };
    if (faceVideo) {
      [faceShadow, facePlate, faceHalo, faceDepth, faceRim, faceCutout, faceCanvas, blink].forEach((oldFaceLayer) => oldFaceLayer?.remove());
      shell.querySelectorAll('.rw-v2-face-bg-mask').forEach((oldFaceMask) => oldFaceMask.remove());
      const videoSources = {
        stable: 'assets/videos/aireel-face-transparent-clean-v4-lossless.webm?v=20260807-binary-alpha-1'
      };
      const pickVideoSource = () => videoSources.stable;
      let videoRevealQueued = false;
      let videoRevealTimer = 0;
      let videoSyncFrame = 0;
      const videoRevealReadyAt = performance.now();
      document.body.classList.add('rw-v2-video-face-mode');
      const faceVideoCanRun = () => {
        if (document.hidden || document.body.classList.contains('app-open')) return false;
        const styles = window.getComputedStyle(faceVideo);
        if (styles.display === 'none' || styles.visibility === 'hidden') return false;
        const rect = faceVideo.getBoundingClientRect();
        return rect.width > 12 && rect.height > 12;
      };
      const parkFaceVideo = (unload = false) => {
        window.clearTimeout(videoRevealTimer);
        videoRevealQueued = false;
        faceVideo.pause?.();
        faceVideo.classList.remove('is-active');
        document.body.classList.remove('rw-v2-video-face-ready');
        if (unload && faceVideo.getAttribute('src')) {
          faceVideo.removeAttribute('src');
          faceVideo.removeAttribute('poster');
          faceVideo.load?.();
        }
      };
      const markVideoReady = () => {
        if (!faceVideoCanRun()) return;
        updateVideoGeometry();
        document.body.classList.add('rw-v2-video-face-ready');
        document.body.classList.remove('rw-v2-canvas-face-ready', 'rw-v2-blink-playing');
        faceVideo.classList.add('is-active');
      };
      const queueVideoReveal = () => {
        if (videoRevealQueued || !faceVideoCanRun()) return;
        videoRevealQueued = true;
        const revealDelay = Math.max(0, videoRevealReadyAt - performance.now());
        if (revealDelay > 0) {
          videoRevealTimer = window.setTimeout(() => {
            videoRevealQueued = false;
            queueVideoReveal();
          }, revealDelay);
          return;
        }
        const reveal = () => {
          videoRevealQueued = false;
          markVideoReady();
        };
        if (faceVideo.requestVideoFrameCallback && !faceVideo.paused) {
          faceVideo.requestVideoFrameCallback(reveal);
        } else {
          window.requestAnimationFrame(reveal);
        }
      };
      const syncFaceVideoPlayback = () => {
        videoSyncFrame = 0;
        updateVideoGeometry();
        if (!faceVideoCanRun()) {
          parkFaceVideo(currentVisualPerformanceProfile().key === 'economy');
          return;
        }
        faceVideo.removeAttribute('poster');
        const nextSource = pickVideoSource();
        if (!faceVideo.src || !faceVideo.src.includes(nextSource.split('?')[0])) {
          faceVideo.classList.remove('is-active');
          document.body.classList.remove('rw-v2-video-face-ready');
          faceVideo.dataset.rwVideoQuality = 'stable';
          faceVideo.src = nextSource;
          faceVideo.load?.();
        }
        const playAttempt = faceVideo.play?.();
        if (playAttempt?.catch) playAttempt.catch(() => {});
        if (faceVideo.readyState >= 3) {
          queueVideoReveal();
        }
      };
      const queueFaceVideoSync = () => {
        if (videoSyncFrame) return;
        videoSyncFrame = window.requestAnimationFrame(syncFaceVideoPlayback);
      };
      faceVideo.muted = true;
      faceVideo.loop = true;
      faceVideo.autoplay = true;
      faceVideo.playsInline = true;
      faceVideo.playbackRate = 1;
      faceVideo.setAttribute('muted', '');
      faceVideo.setAttribute('loop', '');
      faceVideo.setAttribute('autoplay', '');
      faceVideo.setAttribute('playsinline', '');
      faceVideo.preload = 'auto';
      faceVideo.setAttribute('preload', 'auto');
      faceVideo.removeAttribute('poster');
      faceVideo.addEventListener('loadeddata', queueVideoReveal);
      faceVideo.addEventListener('canplay', queueVideoReveal);
      faceVideo.addEventListener('playing', queueVideoReveal);
      queueFaceVideoSync();
      const queueVideoGeometry = () => {
        window.cancelAnimationFrame(raf);
        raf = window.requestAnimationFrame(() => {
          updateVideoGeometry();
          queueFaceVideoSync();
        });
      };
      updateVideoGeometry();
      window.addEventListener('resize', queueVideoGeometry, { passive:true });
      window.addEventListener('orientationchange', queueVideoGeometry, { passive:true });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          parkFaceVideo(false);
          return;
        }
        queueFaceVideoSync();
      });
      new MutationObserver(queueFaceVideoSync).observe(document.body, { attributes:true, attributeFilter:['class'] });
      return;
    }
    const faceImage = new Image();
    const faceSource = { x: 315, y: 65, width: 650, height: 850 };
    faceImage.decoding = 'async';
    const blinkCurve = (t) => {
      const x = clamp(t);
      if (x < .38) return easeInOut(x / .38);
      if (x < .58) return 1;
      return 1 - easeInOut((x - .58) / .42);
    };
    const eyeRig = [
      { cx:176, cy:239, rx:48, ry:18, tilt:.035, lidSource:{ x:122, y:198, width:108, height:52 } },
      { cx:351, cy:255, rx:35, ry:14, tilt:.02, lidSource:{ x:310, y:220, width:82, height:42 } }
    ];
    const drawSmooth = (ctx, points) => {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length - 1; i += 1) {
        const midX = (points[i][0] + points[i + 1][0]) / 2;
        const midY = (points[i][1] + points[i + 1][1]) / 2;
        ctx.quadraticCurveTo(points[i][0], points[i][1], midX, midY);
      }
      const last = points[points.length - 1];
      ctx.lineTo(last[0], last[1]);
    };
    const drawFacePanel = (ctx) => {
      const shellGradient = ctx.createRadialGradient(178, 162, 28, 205, 258, 245);
      shellGradient.addColorStop(0, 'rgba(222,184,156,.98)');
      shellGradient.addColorStop(.45, 'rgba(154,105,86,.96)');
      shellGradient.addColorStop(1, 'rgba(55,37,37,.96)');
      ctx.save();
      ctx.fillStyle = 'rgba(34,18,17,.88)';
      ctx.beginPath();
      ctx.moveTo(111, 105);
      ctx.bezierCurveTo(130, 42, 286, 38, 306, 105);
      ctx.bezierCurveTo(288, 88, 247, 82, 205, 83);
      ctx.bezierCurveTo(163, 82, 129, 89, 111, 105);
      ctx.fill();

      ctx.fillStyle = 'rgba(139,91,76,.86)';
      ctx.beginPath();
      ctx.ellipse(82, 252, 15, 42, -.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(328, 252, 15, 42, .08, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = 'rgba(20,9,8,.42)';
      ctx.shadowBlur = 28;
      ctx.fillStyle = shellGradient;
      ctx.beginPath();
      ctx.moveTo(205, 54);
      ctx.bezierCurveTo(123, 55, 80, 127, 76, 238);
      ctx.bezierCurveTo(73, 350, 122, 458, 205, 496);
      ctx.bezierCurveTo(288, 458, 337, 350, 334, 238);
      ctx.bezierCurveTo(330, 127, 287, 55, 205, 54);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      const sideShade = ctx.createLinearGradient(76, 0, 334, 0);
      sideShade.addColorStop(0, 'rgba(22,10,10,.34)');
      sideShade.addColorStop(.34, 'rgba(255,220,190,0)');
      sideShade.addColorStop(.66, 'rgba(255,220,190,0)');
      sideShade.addColorStop(1, 'rgba(18,8,8,.42)');
      ctx.fillStyle = sideShade;
      ctx.fill();

      ctx.strokeStyle = 'rgba(236,204,176,.34)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.globalAlpha = .32;
      ctx.strokeStyle = 'rgba(94,228,255,.28)';
      ctx.lineWidth = .9;
      [
        [[116,112],[144,164],[139,236],[116,306]],
        [[294,112],[266,164],[271,236],[294,306]],
        [[102,312],[143,336],[184,348],[226,348],[308,312]]
      ].forEach((line) => {
        drawSmooth(ctx, line);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;

      ctx.globalAlpha = .13;
      ctx.fillStyle = 'rgba(255,229,206,.8)';
      for (let i = 0; i < 34; i += 1) {
        const x = 118 + ((i * 37) % 176);
        const y = 145 + ((i * 53) % 235);
        const radius = .55 + ((i % 4) * .12);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const cheek = ctx.createRadialGradient(140, 268, 5, 140, 268, 58);
      cheek.addColorStop(0, 'rgba(234,149,128,.22)');
      cheek.addColorStop(1, 'rgba(234,149,128,0)');
      ctx.fillStyle = cheek;
      ctx.beginPath();
      ctx.arc(140, 268, 58, 0, Math.PI * 2);
      ctx.fill();

      const cheekRight = ctx.createRadialGradient(270, 268, 5, 270, 268, 58);
      cheekRight.addColorStop(0, 'rgba(234,149,128,.18)');
      cheekRight.addColorStop(1, 'rgba(234,149,128,0)');
      ctx.fillStyle = cheekRight;
      ctx.beginPath();
      ctx.arc(270, 268, 58, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    const drawEye = (ctx, eye, blinkAmount) => {
      const p = clamp(blinkAmount);
      if (p <= .01) return;
      const upperEdge = -eye.ry - 3 + (eye.ry * 2.2 * p);
      const lowerEdge = eye.ry + 2 - (eye.ry * .48 * p);
      const closedY = eye.ry * .06;

      ctx.save();
      ctx.translate(eye.cx, eye.cy);
      ctx.rotate(eye.tilt);

      ctx.beginPath();
      ctx.ellipse(0, 0, eye.rx, eye.ry + 4, 0, 0, Math.PI * 2);
      ctx.clip();

      ctx.globalAlpha = .82;
      ctx.drawImage(
        faceCanvas,
        Math.max(0, eye.lidSource.x), Math.max(0, eye.lidSource.y), eye.lidSource.width, eye.lidSource.height,
        -eye.rx - 8, -eye.ry - 8, eye.rx * 2 + 16, eye.ry * 2 + 20
      );
      ctx.globalAlpha = 1;

      const lidFill = ctx.createLinearGradient(0, -eye.ry - 10, 0, eye.ry + 10);
      lidFill.addColorStop(0, 'rgba(30,111,153,.36)');
      lidFill.addColorStop(.42, 'rgba(7,34,55,.70)');
      lidFill.addColorStop(1, 'rgba(0,8,18,.88)');
      ctx.fillStyle = lidFill;

      ctx.beginPath();
      ctx.moveTo(-eye.rx - 6, -eye.ry - 7);
      ctx.lineTo(eye.rx + 6, -eye.ry - 7);
      ctx.lineTo(eye.rx + 6, upperEdge - eye.ry * .14);
      ctx.bezierCurveTo(eye.rx * .48, upperEdge + eye.ry * .27, -eye.rx * .48, upperEdge + eye.ry * .27, -eye.rx - 6, upperEdge - eye.ry * .14);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-eye.rx - 6, eye.ry + 6);
      ctx.lineTo(eye.rx + 6, eye.ry + 6);
      ctx.lineTo(eye.rx + 6, lowerEdge + eye.ry * .1);
      ctx.bezierCurveTo(eye.rx * .48, lowerEdge - eye.ry * .08, -eye.rx * .48, lowerEdge - eye.ry * .08, -eye.rx - 6, lowerEdge + eye.ry * .1);
      ctx.closePath();
      ctx.globalAlpha = .48;
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = 'rgba(2,10,18,.82)';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-eye.rx + 3, upperEdge - eye.ry * .13);
      ctx.bezierCurveTo(-eye.rx * .46, upperEdge + eye.ry * .24, eye.rx * .46, upperEdge + eye.ry * .24, eye.rx - 3, upperEdge - eye.ry * .13);
      ctx.stroke();

      if (p > .66) {
        ctx.strokeStyle = 'rgba(0,6,13,.94)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-eye.rx + 4, closedY);
        ctx.bezierCurveTo(-eye.rx * .42, closedY + eye.ry * .13, eye.rx * .42, closedY + eye.ry * .13, eye.rx - 4, closedY);
        ctx.stroke();
      }

      ctx.restore();
    };
    const drawLowerFace = (ctx) => {
      ctx.save();
      const noseShade = ctx.createLinearGradient(188, 235, 222, 340);
      noseShade.addColorStop(0, 'rgba(68,35,31,0)');
      noseShade.addColorStop(.76, 'rgba(66,35,31,.24)');
      ctx.fillStyle = noseShade;
      ctx.beginPath();
      ctx.moveTo(205, 228);
      ctx.bezierCurveTo(194, 264, 190, 307, 184, 333);
      ctx.bezierCurveTo(196, 343, 215, 343, 226, 333);
      ctx.bezierCurveTo(220, 306, 216, 264, 205, 228);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(70,36,32,.42)';
      ctx.lineWidth = 1.2;
      drawSmooth(ctx, [[193,331],[202,336],[217,331]]);
      ctx.stroke();
      ctx.fillStyle = 'rgba(45,21,20,.48)';
      ctx.beginPath();
      ctx.ellipse(194, 331, 5, 2, -.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(217, 331, 5, 2, .15, 0, Math.PI * 2);
      ctx.fill();

      const lip = ctx.createLinearGradient(160, 386, 250, 405);
      lip.addColorStop(0, 'rgba(82,36,42,.92)');
      lip.addColorStop(.5, 'rgba(138,70,74,.94)');
      lip.addColorStop(1, 'rgba(55,24,31,.92)');
      ctx.fillStyle = lip;
      ctx.beginPath();
      ctx.moveTo(164, 391);
      ctx.bezierCurveTo(181, 382, 194, 387, 205, 387);
      ctx.bezierCurveTo(216, 387, 229, 382, 246, 391);
      ctx.bezierCurveTo(229, 405, 181, 405, 164, 391);
      ctx.fill();

      ctx.strokeStyle = 'rgba(34,14,18,.72)';
      ctx.lineWidth = 1.6;
      drawSmooth(ctx, [[166,391],[186,394],[205,393],[224,394],[244,391]]);
      ctx.stroke();
      ctx.restore();
    };
    const renderCanvasFace = (blinkAmount = 0) => {
      if (!canvasCtx || !faceCanvas || !faceImage.complete || !faceImage.naturalWidth) return;
      if (faceCanvas.width !== faceCrop.width || faceCanvas.height !== faceCrop.height) {
        faceCanvas.width = faceCrop.width;
        faceCanvas.height = faceCrop.height;
      }
      canvasCtx.clearRect(0, 0, faceCanvas.width, faceCanvas.height);
      canvasCtx.drawImage(
        faceImage,
        faceSource.x, faceSource.y, faceSource.width, faceSource.height,
        0, 0, faceCrop.width, faceCrop.height
      );
      eyeRig.forEach((eye) => drawEye(canvasCtx, eye, blinkAmount));
    };
    const tickBlink = (now) => {
      const progress = blinkDuration ? (now - blinkStartedAt) / blinkDuration : 1;
      renderCanvasFace(blinkCurve(progress));
      if (progress < 1) {
        blinkAnimFrame = window.requestAnimationFrame(tickBlink);
        return;
      }
      blinkActive = false;
      renderCanvasFace(0);
      blink.classList.remove('is-playing');
      document.body.classList.remove('rw-v2-blink-playing');
      blinkDone?.();
      blinkDone = null;
    };
    const activateCanvasFace = () => {
      if (!faceCanvas || !canvasCtx || !faceImage.complete || !faceImage.naturalWidth) return;
      renderCanvasFace(0);
      document.body.classList.add('rw-v2-canvas-face-ready');
      if (eyeContact) {
        eyeContact.style.setProperty('opacity', '0', 'important');
      }
    };
    faceImage.addEventListener('load', activateCanvasFace, { once:true });
    activateCanvasFace();
    const nextBlinkDelay = () => {
      const multiplier = currentVisualPerformanceProfile().blinkDelayMultiplier || 1;
      const base = 1250 + Math.pow(Math.random(), 1.2) * 2500;
      const delay = Math.random() < .14 ? base + randomBetween(650, 1500) : base;
      return delay * multiplier;
    };
    const updateGeometry = () => {
      const rect = shell.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const scale = Math.max(rect.width / natural.width, rect.height / natural.height);
      const renderedWidth = natural.width * scale;
      const renderedHeight = natural.height * scale;
      const offsetX = (rect.width - renderedWidth) / 2;
      const offsetY = (rect.height - renderedHeight) / 2;
      blink.style.setProperty('--rw-face-left', `${offsetX + faceCrop.x * scale}px`);
      blink.style.setProperty('--rw-face-top', `${offsetY + faceCrop.y * scale}px`);
      blink.style.setProperty('--rw-face-width', `${faceCrop.width * scale}px`);
      blink.style.setProperty('--rw-face-height', `${faceCrop.height * scale}px`);
      blink.style.setProperty('--rw-head-origin-x', `${offsetX + (faceCrop.x + faceCrop.width * .52) * scale}px`);
      blink.style.setProperty('--rw-head-origin-y', `${offsetY + (faceCrop.y + faceCrop.height * .46) * scale}px`);
      [faceShadow, facePlate, faceHalo, faceCutout, faceCanvas].forEach((faceLayer) => {
        if (!faceLayer) return;
        faceLayer.style.setProperty('--rw-face-left', `${offsetX + faceCrop.x * scale}px`);
        faceLayer.style.setProperty('--rw-face-top', `${offsetY + faceCrop.y * scale}px`);
        faceLayer.style.setProperty('--rw-face-width', `${faceCrop.width * scale}px`);
        faceLayer.style.setProperty('--rw-face-height', `${faceCrop.height * scale}px`);
      });
    };
    const queueGeometry = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(updateGeometry);
    };
    const playBlink = (duration = 1180, done) => {
      window.clearTimeout(hideTimer);
      window.cancelAnimationFrame(blinkAnimFrame);
      updateGeometry();
      blink.style.setProperty('--rw-blink-duration', `${Math.round(duration)}ms`);
      blink.classList.remove('is-playing');
      document.body.classList.remove('rw-v2-blink-playing');
      blink.offsetHeight;
      blink.classList.add('is-playing');
      document.body.classList.add('rw-v2-blink-playing');
      blinkActive = true;
      blinkStartedAt = performance.now();
      blinkDuration = duration;
      blinkDone = done;
      renderCanvasFace(0);
      blinkAnimFrame = window.requestAnimationFrame(tickBlink);
      hideTimer = window.setTimeout(() => {
        window.cancelAnimationFrame(blinkAnimFrame);
        blinkActive = false;
        renderCanvasFace(0);
        blink.classList.remove('is-playing');
        document.body.classList.remove('rw-v2-blink-playing');
        blinkDone?.();
        blinkDone = null;
      }, duration + 80);
    };
    const runBlink = () => {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      const profile = currentVisualPerformanceProfile();
      if (profile.blinkEnabled !== false && !reducedMotion && !document.body.classList.contains('app-open') && !document.hidden) {
        playBlink(randomBetween(620, 820), () => {
          if (profile.key === 'high' && Math.random() < .16) {
            window.setTimeout(() => playBlink(randomBetween(520, 680)), randomBetween(230, 410));
          }
        });
      }
      window.setTimeout(runBlink, nextBlinkDelay());
    };
    updateGeometry();
    window.addEventListener('resize', queueGeometry, { passive:true });
    window.addEventListener('orientationchange', queueGeometry, { passive:true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        window.clearTimeout(hideTimer);
        window.cancelAnimationFrame(blinkAnimFrame);
        blinkActive = false;
        renderCanvasFace(0);
        blink.classList.remove('is-playing');
        document.body.classList.remove('rw-v2-blink-playing');
      }
    });
    window.setTimeout(runBlink, randomBetween(900, 1700));
  }

  function renderHero(){
    const hero = document.querySelector('.rw-v2-hero');
    if (!hero) return;
    hero.innerHTML = `<div class="rw-v2-hero-poster">
      <div class="rw-v2-home-lang" role="group" aria-label="Language">
        <button type="button" data-rw-home-lang="pl">PL</button>
        <button type="button" data-rw-home-lang="en">EN</button>
        <button type="button" data-rw-home-lang="nl">NL</button>
      </div>
    </div>`;
    syncHomeLang();
    updateWallClock();
    renderCommandUi();
  }
  function renderToolbar(){
    const toolbar = document.querySelector('.rw-v2-toolbar');
    if (!toolbar) return;
    activeFilter = 'all';
    toolbar.hidden = true;
    toolbar.innerHTML = '';
    renderCommandUi();
  }
  function moduleCards(){
    return Array.from(document.querySelectorAll('main.wrap .grid .card'));
  }
  function renderSystemStrip(){
    const strip = document.querySelector('.rw-v2-system-strip');
    if (!strip) return;
    const count = moduleCards().filter(card => !card.hidden).length;
    const stamp = new Date().toLocaleTimeString(lang() === 'nl' ? 'nl-NL' : lang() === 'en' ? 'en-GB' : 'pl-PL', { hour:'2-digit', minute:'2-digit' });
    strip.innerHTML = `<span class="rw-v2-strip-online"><i></i>${uiText('systemOnline')}</span><strong>${count}</strong><span>${uiText('quickAccess')}</span><span>${lang().toUpperCase()}</span><span>${stamp}</span>`;
  }
  function nativeWallCanvasCanPaint(){
    const canvas = document.querySelector('.rw-v2-native-wall-canvas');
    if (!canvas) return false;
    if (window.getComputedStyle(canvas).display === 'none') return false;
    const rect = canvas.getBoundingClientRect();
    return rect.width > 10 && rect.height > 10;
  }
  function startNativeWallCanvas(){
    if (nativeWallEngineStarted) return;
    const canvas = document.querySelector('.rw-v2-native-wall-canvas');
    if (!canvas) return;
    if (!nativeWallCanvasCanPaint()) return;
    const ctx = canvas.getContext('2d', { alpha:true });
    if (!ctx) return;
    nativeWallEngineStarted = true;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const state = {
      charts:[
        [0.12,0.52,0.22,0.47,0.31,0.37,0.43,0.22,0.57,0.27,0.72,0.12,0.86,0.09],
        [0.52,0.28,0.60,0.13,0.68,0.35,0.76,0.17,0.85,0.31,0.94,0.22],
        [0.11,0.84,0.20,0.76,0.30,0.70,0.40,0.79,0.52,0.58,0.64,0.66,0.78,0.48],
        [0.64,0.50,0.70,0.41,0.77,0.54,0.84,0.36,0.91,0.47]
      ],
      nodes:[
        [0.67,0.63,.2],[0.72,0.69,.8],[0.78,0.61,1.4],[0.84,0.73,2.1],[0.90,0.65,2.8],
        [0.58,0.34,.5],[0.66,0.28,1.7],[0.76,0.31,2.4],[0.86,0.25,3.1],
        [0.20,0.35,1.2],[0.30,0.24,2.6],[0.40,0.18,.9]
      ]
    };
    function fitCanvas(){
      const rect = canvas.getBoundingClientRect();
      const profile = currentVisualPerformanceProfile();
      const dpr = Math.min(profile.wallDprCap || 1.25, Math.max(1, window.devicePixelRatio || 1));
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w:rect.width, h:rect.height, dpr };
    }
    function drawPanelGrid(x, y, w, h, alpha){
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = 'rgba(126,211,255,.17)';
      ctx.lineWidth = .55;
      ctx.strokeRect(x, y, w, h);
      ctx.globalAlpha = alpha * .62;
      for (let i = 1; i < 5; i++) {
        const yy = y + (h / 5) * i;
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.lineTo(x + w, yy);
        ctx.stroke();
      }
      for (let i = 1; i < 6; i++) {
        const xx = x + (w / 6) * i;
        ctx.beginPath();
        ctx.moveTo(xx, y);
        ctx.lineTo(xx, y + h);
        ctx.stroke();
      }
      ctx.globalAlpha = alpha * .30;
      ctx.lineWidth = .35;
      for (let i = 1; i < 18; i++) {
        const xx = x + (w / 18) * i;
        ctx.beginPath();
        ctx.moveTo(xx, y);
        ctx.lineTo(xx, y + h);
        ctx.stroke();
      }
      for (let i = 1; i < 12; i++) {
        const yy = y + (h / 12) * i;
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.lineTo(x + w, yy);
        ctx.stroke();
      }
      ctx.restore();
    }
    function drawMicroLabel(text, x, y, alpha = .24){
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(179,233,255,.82)';
      ctx.font = '600 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.letterSpacing = '0px';
      ctx.fillText(text, x, y);
      ctx.restore();
    }
    function drawLine(points, box, time, color, width, phase){
      const [x, y, w, h] = box;
      const sampled = points.map((value, index) => {
        const px = x + (w * index) / Math.max(1, points.length - 1);
        const wave = Math.sin(time * .0017 + index * .92 + phase) * h * .035;
        const py = y + h - value * h + wave;
        return [px, py];
      });
      ctx.save();
      const area = ctx.createLinearGradient(0, y, 0, y + h);
      area.addColorStop(0, 'rgba(126,226,255,.125)');
      area.addColorStop(1, 'rgba(24,120,180,0)');
      ctx.fillStyle = area;
      ctx.beginPath();
      sampled.forEach(([px, py], index) => {
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 8;
      ctx.shadowColor = color;
      ctx.strokeStyle = color;
      ctx.beginPath();
      sampled.forEach(([px, py], index) => {
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      const probe = ((time * .00009 + phase * .07) % 1) * (sampled.length - 1);
      const pi = Math.floor(probe);
      const mix = probe - pi;
      const a = sampled[pi] || sampled[0];
      const b = sampled[pi + 1] || a;
      const dx = a[0] + (b[0] - a[0]) * mix;
      const dy = a[1] + (b[1] - a[1]) * mix;
      ctx.fillStyle = 'rgba(219,249,255,.82)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(dx, dy, 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    function drawBars(x, y, w, h, time){
      ctx.save();
      const count = 18;
      const gap = w / count * .38;
      const bw = (w - gap * (count - 1)) / count;
      for (let i = 0; i < count; i++) {
        const n = .28 + (Math.sin(time * .0012 + i * .74) + 1) * .26 + (i % 5) * .035;
        const bh = Math.min(h * .9, h * n);
        const px = x + i * (bw + gap);
        const py = y + h - bh;
        const grd = ctx.createLinearGradient(0, py, 0, y + h);
        grd.addColorStop(0, 'rgba(150,236,255,.78)');
        grd.addColorStop(.5, 'rgba(66,190,230,.35)');
        grd.addColorStop(1, 'rgba(47,132,190,.10)');
        ctx.fillStyle = grd;
        ctx.shadowBlur = 6;
        ctx.shadowColor = 'rgba(105,210,255,.34)';
        ctx.fillRect(px, py, bw, bh);
      }
      ctx.restore();
    }
    function drawWorldMap(x, y, w, h, time){
      ctx.save();
      ctx.globalAlpha = .56;
      ctx.strokeStyle = 'rgba(119,205,244,.34)';
      ctx.lineWidth = 1;
      ctx.shadowBlur = 7;
      ctx.shadowColor = 'rgba(91,174,231,.20)';
      ctx.globalAlpha = .18;
      for (let i = 1; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(x, y + h * i / 5);
        ctx.lineTo(x + w, y + h * i / 5);
        ctx.stroke();
      }
      for (let i = 1; i < 7; i++) {
        ctx.beginPath();
        ctx.moveTo(x + w * i / 7, y);
        ctx.lineTo(x + w * i / 7, y + h);
        ctx.stroke();
      }
      ctx.globalAlpha = .56;
      const land = [
        [[.05,.48],[.13,.38],[.24,.40],[.31,.50],[.24,.60],[.13,.61],[.05,.54]],
        [[.32,.43],[.43,.34],[.55,.39],[.58,.52],[.48,.61],[.37,.57]],
        [[.60,.46],[.71,.38],[.83,.42],[.93,.55],[.84,.66],[.70,.62],[.62,.55]],
        [[.45,.64],[.52,.70],[.50,.82],[.42,.77]]
      ];
      land.forEach(poly => {
        ctx.beginPath();
        poly.forEach(([px, py], index) => {
          const xx = x + px * w;
          const yy = y + py * h;
          if (index) ctx.lineTo(xx, yy);
          else ctx.moveTo(xx, yy);
        });
        ctx.closePath();
        ctx.stroke();
      });
      const routes = [
        [[.18,.50],[.42,.44],[.68,.49],[.86,.54]],
        [[.31,.54],[.51,.67],[.73,.58]],
        [[.54,.42],[.73,.39],[.91,.55]]
      ];
      routes.forEach((route, ri) => {
        ctx.beginPath();
        route.forEach(([px, py], index) => {
          const xx = x + px * w;
          const yy = y + py * h;
          if (index) ctx.quadraticCurveTo(x + (route[index - 1][0] + px) * w / 2, y + (route[index - 1][1] + py) * h / 2 - h * .08, xx, yy);
          else ctx.moveTo(xx, yy);
        });
        ctx.setLineDash([6, 10]);
        ctx.lineDashOffset = -time * .018 - ri * 12;
        ctx.stroke();
        const head = (time * .00012 + ri * .25) % 1;
        const from = route[Math.max(0, Math.floor((route.length - 1) * head))];
        const to = route[Math.min(route.length - 1, Math.floor((route.length - 1) * head) + 1)];
        const local = (head * (route.length - 1)) % 1;
        const hx = x + (from[0] + (to[0] - from[0]) * local) * w;
        const hy = y + (from[1] + (to[1] - from[1]) * local) * h - Math.sin(local * Math.PI) * h * .08;
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(228,252,255,.72)';
        ctx.beginPath();
        ctx.arc(hx, hy, 1.7, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.setLineDash([]);
      state.nodes.slice(0, 5).forEach(([px, py, offset]) => {
        const pulse = (Math.sin(time * .002 + offset) + 1) / 2;
        ctx.fillStyle = `rgba(180,240,255,${.42 + pulse * .36})`;
        ctx.beginPath();
        ctx.arc(x + px * w, y + py * h, 1.4 + pulse * 1.8, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
    function drawNetwork(x, y, w, h, time){
      ctx.save();
      const points = state.nodes.slice(5);
      ctx.strokeStyle = 'rgba(126,211,255,.22)';
      ctx.lineWidth = .85;
      ctx.shadowBlur = 5;
      ctx.shadowColor = 'rgba(126,211,255,.18)';
      for (let i = 0; i < points.length - 1; i++) {
        for (let j = i + 1; j < points.length; j++) {
          if ((i + j) % 3 === 0) {
            ctx.beginPath();
            ctx.moveTo(x + points[i][0] * w, y + points[i][1] * h);
            ctx.lineTo(x + points[j][0] * w, y + points[j][1] * h);
            ctx.stroke();
          }
        }
      }
      points.forEach(([px, py, offset]) => {
        const pulse = (Math.sin(time * .0025 + offset) + 1) / 2;
        ctx.fillStyle = `rgba(190,242,255,${.38 + pulse * .36})`;
        ctx.beginPath();
        ctx.arc(x + px * w, y + py * h, 1.2 + pulse * 1.4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
    function drawRadarCore(cx, cy, radius, time){
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalCompositeOperation = 'screen';
      const spin = time * .00034;
      const counterSpin = -time * .00022;
      const pulse = (Math.sin(time * .0021) + 1) / 2;
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      core.addColorStop(0, `rgba(145,235,255,${.16 + pulse * .08})`);
      core.addColorStop(.28, 'rgba(96,205,245,.055)');
      core.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = .65;
      for (let i = 0; i < 5; i++) {
        const r = radius * (.34 + i * .13);
        ctx.strokeStyle = `rgba(129,219,255,${.10 + i * .022})`;
        ctx.setLineDash(i % 2 ? [2.5, 8] : [1.5, 5.5]);
        ctx.lineDashOffset = (i % 2 ? time * .010 : -time * .014) + i * 8;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      ctx.save();
      ctx.rotate(spin);
      ctx.strokeStyle = 'rgba(155,236,255,.20)';
      ctx.lineWidth = .7;
      for (let i = 0; i < 24; i++) {
        const angle = i * Math.PI * 2 / 24;
        const inner = radius * (i % 3 === 0 ? .58 : .66);
        const outer = radius * .88;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.rotate(counterSpin);
      ctx.strokeStyle = 'rgba(111,207,249,.20)';
      ctx.lineWidth = .55;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * (.70 + i * .06), radius * (.52 + i * .05), i * .42, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      const sweep = time * .00145;
      const sweepGradient = ctx.createConicGradient(sweep - .35, 0, 0);
      sweepGradient.addColorStop(0, 'rgba(88,210,255,0)');
      sweepGradient.addColorStop(.05, 'rgba(113,221,255,.16)');
      sweepGradient.addColorStop(.13, 'rgba(205,251,255,.34)');
      sweepGradient.addColorStop(.18, 'rgba(113,221,255,.08)');
      sweepGradient.addColorStop(.24, 'rgba(88,210,255,0)');
      sweepGradient.addColorStop(1, 'rgba(88,210,255,0)');
      ctx.fillStyle = sweepGradient;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius * .92, sweep - .42, sweep + .22);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.rotate(sweep);
      ctx.strokeStyle = 'rgba(210,252,255,.54)';
      ctx.lineWidth = 1.05;
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(130,226,255,.45)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(radius * .92, 0);
      ctx.stroke();
      ctx.restore();

      const blips = [
        [.30, .42, .2], [.58, -.18, 1.1], [-.46, -.36, 2.0], [.08, -.64, 2.9],
        [-.66, .22, 3.7], [.72, .33, 4.5], [-.20, .58, 5.2]
      ];
      blips.forEach(([px, py, offset], index) => {
        const activity = (Math.sin(time * .0024 + offset) + 1) / 2;
        const blink = Math.max(0, Math.sin(time * .004 + offset));
        const x = px * radius;
        const y = py * radius;
        ctx.fillStyle = `rgba(213,251,255,${.18 + activity * .34})`;
        ctx.shadowBlur = 8 + blink * 8;
        ctx.shadowColor = 'rgba(126,231,255,.46)';
        ctx.beginPath();
        ctx.arc(x, y, 1.1 + activity * (index % 2 ? 1.5 : 2.1), 0, Math.PI * 2);
        ctx.fill();
        if (blink > .78) {
          ctx.strokeStyle = `rgba(126,231,255,${(blink - .78) * .55})`;
          ctx.lineWidth = .55;
          ctx.beginPath();
          ctx.arc(x, y, 5 + blink * 8, 0, Math.PI * 2);
          ctx.stroke();
        }
      });

      ctx.shadowBlur = 14;
      ctx.shadowColor = 'rgba(144,231,255,.48)';
      ctx.fillStyle = 'rgba(223,253,255,.72)';
      ctx.beginPath();
      ctx.arc(0, 0, 1.6 + pulse * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    function drawHeat(x, y, w, h, time){
      ctx.save();
      const cols = 14;
      const rows = 7;
      const gap = 2;
      const cw = (w - gap * (cols - 1)) / cols;
      const ch = (h - gap * (rows - 1)) / rows;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const v = (Math.sin(time * .001 + row * .9 + col * .43) + 1) / 2;
          ctx.fillStyle = `rgba(${70 + v * 70}, ${160 + v * 70}, ${210 + v * 35}, ${.04 + v * .14})`;
          ctx.fillRect(x + col * (cw + gap), y + row * (ch + gap), cw, ch);
        }
      }
      ctx.restore();
    }
    function drawMicroMatrix(x, y, w, h, time){
      ctx.save();
      ctx.font = '600 6px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.fillStyle = 'rgba(162,228,255,.30)';
      const rows = 9;
      const cols = 7;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const value = Math.abs(Math.sin(time * .0008 + row * 1.71 + col * .83));
          const label = value > .66 ? `${Math.round(value * 97)}` : value > .42 ? '::' : '--';
          ctx.globalAlpha = .08 + value * .16;
          ctx.fillText(label, x + col * (w / cols), y + row * (h / rows));
        }
      }
      ctx.restore();
    }
    function drawSpectralNoise(w, h, time){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 90; i++) {
        const seed = Math.sin(i * 91.7) * 10000;
        const px = (seed - Math.floor(seed)) * w;
        const py = ((Math.sin(i * 47.3 + 2) * 10000) % 1 + 1) % 1 * h;
        const pulse = (Math.sin(time * .0014 + i) + 1) / 2;
        ctx.fillStyle = `rgba(160,231,255,${.012 + pulse * .022})`;
        ctx.fillRect(px, py, 1.1, 1.1);
      }
      ctx.restore();
    }
    function drawScanPass(w, h, time){
      ctx.save();
      const y = (time * .018) % h;
      const band = ctx.createLinearGradient(0, y - h * .08, 0, y + h * .08);
      band.addColorStop(0, 'rgba(100,210,255,0)');
      band.addColorStop(.5, 'rgba(166,235,255,.045)');
      band.addColorStop(1, 'rgba(100,210,255,0)');
      ctx.fillStyle = band;
      ctx.fillRect(0, y - h * .08, w, h * .16);
      ctx.globalAlpha = .09;
      ctx.strokeStyle = 'rgba(174,237,255,.55)';
      ctx.lineWidth = .8;
      ctx.beginPath();
      ctx.moveTo(w * .04, y);
      ctx.lineTo(w * .95, y);
      ctx.stroke();
      ctx.restore();
    }
    function drawCityStreetLayer(x, y, w, h, time){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = 'rgba(128,218,255,.22)';
      ctx.lineWidth = .72;
      for (let i = 0; i < 7; i++) {
        const px = x + w * (.10 + i * .13);
        ctx.beginPath();
        ctx.moveTo(px, y + h * .08);
        ctx.lineTo(px + w * .08, y + h * .92);
        ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const py = y + h * (.12 + i * .14);
        ctx.beginPath();
        ctx.moveTo(x + w * .05, py);
        ctx.lineTo(x + w * .94, py + Math.sin(i * 1.4) * h * .035);
        ctx.stroke();
      }
      const route = [[.10,.74],[.24,.61],[.39,.65],[.54,.43],[.70,.50],[.86,.30]];
      ctx.strokeStyle = 'rgba(255,210,122,.58)';
      ctx.lineWidth = 1.45;
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(255,201,104,.32)';
      ctx.beginPath();
      route.forEach(([px, py], index) => {
        const xx = x + px * w;
        const yy = y + py * h + Math.sin(time * .0012 + index) * h * .012;
        if (index) ctx.lineTo(xx, yy);
        else ctx.moveTo(xx, yy);
      });
      ctx.stroke();
      const events = [[.18,.28,.2],[.42,.38,1.1],[.58,.72,2.4],[.80,.56,3.2],[.35,.82,4.1]];
      events.forEach(([px, py, offset], index) => {
        const pulse = (Math.sin(time * .003 + offset) + 1) / 2;
        ctx.fillStyle = index % 2 ? `rgba(185,244,255,${.34 + pulse * .34})` : `rgba(255,214,128,${.40 + pulse * .38})`;
        ctx.shadowBlur = 8 + pulse * 10;
        ctx.beginPath();
        ctx.arc(x + px * w, y + py * h, 1.6 + pulse * 2.8, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
    function drawExistingScreenGestures(w, h, time, panels){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const controls = [
        { hand:[w * .77, h * .66], panel:panels.chart, label:'FLOW' },
        { hand:[w * .77, h * .66], panel:panels.world, label:'ROUTE' },
        { hand:[w * .66, h * .88], panel:panels.city, label:'CITY' },
        { hand:[w * .66, h * .88], panel:panels.radar, label:'SCAN' },
        { hand:[w * .74, h * .70], panel:panels.network, label:'NODE' },
        { hand:[w * .68, h * .82], panel:panels.micro, label:'SYNC' },
        { hand:[w * .66, h * .88], panel:panels.bars, label:'LOAD' }
      ];
      const cycle = 6900;
      const slot = Math.floor(time / cycle) % controls.length;
      const nextSlot = (slot + 1) % controls.length;
      const t = (time % cycle) / cycle;
      const move = Math.max(0, Math.min(1, (t - .72) / .22));
      const easeMove = move * move * (3 - 2 * move);
      const active = controls[slot];
      const next = controls[nextSlot];
      const lerp = (a, b, p) => a + (b - a) * p;
      const fitPanel = (panel) => {
        const pad = Math.max(2, Math.min(panel[2], panel[3]) * .035);
        return [panel[0] + pad, panel[1] + pad, panel[2] - pad * 2, panel[3] - pad * 2];
      };
      const activePanel = fitPanel(active.panel);
      const nextPanel = fitPanel(next.panel);
      const panelBox = [
        lerp(activePanel[0], nextPanel[0], easeMove),
        lerp(activePanel[1], nextPanel[1], easeMove),
        lerp(activePanel[2], nextPanel[2], easeMove),
        lerp(activePanel[3], nextPanel[3], easeMove)
      ];
      const [hx, hy] = [
        lerp(active.hand[0], next.hand[0], easeMove),
        lerp(active.hand[1], next.hand[1], easeMove)
      ];
      const [px, py, pw, ph] = panelBox;
      const tx = px + pw * .50;
      const ty = py + ph * .50;
      const hold = move > 0 ? 1 - move * .22 : 1;
      const envelope = Math.sin(Math.min(1, t) * Math.PI) * hold;
      const packet = Math.min(1, Math.max(0, (t - .14) / .54));
      const handPulse = .45 + envelope * .55;

      const halo = ctx.createRadialGradient(hx, hy, 0, hx, hy, 40 + handPulse * 34);
      halo.addColorStop(0, `rgba(178,245,255,${.16 + handPulse * .18})`);
      halo.addColorStop(.42, `rgba(88,211,255,${.075 + handPulse * .070})`);
      halo.addColorStop(1, 'rgba(88,211,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(hx, hy, 46 + handPulse * 14, 0, Math.PI * 2);
      ctx.fill();

      const cx = hx - w * .10;
      const cy = hy - h * .24;
      ctx.strokeStyle = `rgba(139,230,255,${.16 + envelope * .28})`;
      ctx.lineWidth = 1.35;
      ctx.shadowBlur = 18;
      ctx.shadowColor = 'rgba(106,222,255,.34)';
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.quadraticCurveTo(cx, cy, tx, ty);
      ctx.stroke();

      const qx = (1 - packet) * (1 - packet) * hx + 2 * (1 - packet) * packet * cx + packet * packet * tx;
      const qy = (1 - packet) * (1 - packet) * hy + 2 * (1 - packet) * packet * cy + packet * packet * ty;
      ctx.fillStyle = `rgba(231,253,255,${.68 + envelope * .28})`;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(qx, qy, 1.8 + envelope * 1.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.clip();
      const panelGlow = ctx.createRadialGradient(tx, ty, 0, tx, ty, Math.max(pw, ph) * .70);
      panelGlow.addColorStop(0, `rgba(122,229,255,${.13 + envelope * .16})`);
      panelGlow.addColorStop(.50, `rgba(58,176,235,${.050 + envelope * .075})`);
      panelGlow.addColorStop(1, 'rgba(58,176,235,0)');
      ctx.fillStyle = panelGlow;
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = `rgba(181,244,255,${.28 + envelope * .44})`;
      ctx.lineWidth = 1.25;
      ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
      ctx.strokeStyle = `rgba(255,211,124,${.14 + envelope * .20})`;
      ctx.lineWidth = .55;
      ctx.strokeRect(px + 4, py + 4, Math.max(1, pw - 8), Math.max(1, ph - 8));
      ctx.fillStyle = `rgba(205,249,255,${.34 + envelope * .38})`;
      ctx.font = `${Math.max(7, Math.min(9, ph * .055))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      const label = move > .56 ? next.label : active.label;
      ctx.fillText(`GESTURE // ${label}`, px + pw * .07, py + Math.max(13, ph * .14));
      const scanY = py + ph * (.16 + packet * .70);
      const scan = ctx.createLinearGradient(px, scanY, px + pw, scanY);
      scan.addColorStop(0, 'rgba(127,226,255,0)');
      scan.addColorStop(.45, `rgba(220,252,255,${.12 + envelope * .28})`);
      scan.addColorStop(1, 'rgba(127,226,255,0)');
      ctx.fillStyle = scan;
      ctx.fillRect(px + pw * .05, scanY - 1, pw * .90, 2);
      ctx.restore();

      ctx.save();
      controls.forEach((control, index) => {
        if (index === slot) return;
        const [ox, oy, ow, oh] = control.panel;
        const idle = (Math.sin(time * .001 + index * 1.3) + 1) / 2;
        ctx.strokeStyle = `rgba(126,226,255,${.035 + idle * .035})`;
        ctx.lineWidth = .55;
        ctx.strokeRect(ox + 1, oy + 1, ow - 2, oh - 2);
      });
      ctx.restore();
      ctx.restore();
    }
    function drawInsidePanel(panel, draw){
      const [x, y, w, h] = panel;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      draw(x, y, w, h);
      ctx.restore();
    }
    function drawPanelActivity(x, y, w, h, time, label){
      void x; void y; void w; void h; void time; void label;
    }
    function drawCompactMetrics(x, y, w, h, time){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      [0, 1, 2].forEach((_, index) => {
        const yy = y + h * (.22 + index * .24);
        const value = .34 + (Math.sin(time * .0015 + index * 1.05) + 1) * .28;
        ctx.fillStyle = 'rgba(58,160,220,.16)';
        ctx.fillRect(x + w * .12, yy - 5, w * .74, 4);
        ctx.fillStyle = index === 1 ? 'rgba(255,209,122,.54)' : 'rgba(126,229,255,.54)';
        ctx.fillRect(x + w * .12, yy - 5, w * .74 * value, 4);
      });
      ctx.restore();
    }
    function drawMinimalRadar(cx, cy, radius, time){
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalCompositeOperation = 'screen';
      const sweep = time * .0012;
      ctx.strokeStyle = 'rgba(156,236,255,.42)';
      ctx.lineWidth = 1;
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(126,226,255,.28)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(sweep) * radius, Math.sin(sweep) * radius);
      ctx.stroke();
      ctx.fillStyle = 'rgba(213,251,255,.55)';
      for (let i = 0; i < 3; i++) {
        const a = sweep * .55 + i * 2.1;
        const r = radius * (.34 + i * .16);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    function drawMapPulses(x, y, w, h, time){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      [[.20,.32,.2],[.46,.48,1.3],[.72,.36,2.2],[.62,.70,3.1]].forEach(([px, py, offset], index) => {
        const pulse = (Math.sin(time * .0028 + offset) + 1) / 2;
        ctx.fillStyle = index ? `rgba(184,244,255,${.28 + pulse * .34})` : `rgba(255,214,128,${.34 + pulse * .36})`;
        ctx.shadowBlur = 7 + pulse * 8;
        ctx.beginPath();
        ctx.arc(x + px * w, y + py * h, 1.5 + pulse * 2.2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
    function drawNativeWallFrame(time){
      const { w, h } = fitCanvas();
      if (w < 10 || h < 10) return;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const vignette = ctx.createRadialGradient(w * .52, h * .45, 0, w * .52, h * .45, w * .72);
      vignette.addColorStop(0, 'rgba(115,210,255,.075)');
      vignette.addColorStop(.52, 'rgba(54,140,200,.030)');
      vignette.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
      const panels = {
        radar:[w * .032, h * .078, w * .278, h * .340],
        network:[w * .354, h * .086, w * .208, h * .265],
        chart:[w * .636, h * .100, w * .302, h * .232],
        city:[w * .040, h * .505, w * .306, h * .374],
        micro:[w * .397, h * .482, w * .174, h * .190],
        bars:[w * .396, h * .724, w * .184, h * .168],
        world:[w * .626, h * .422, w * .314, h * .388]
      };
      drawInsidePanel(panels.radar, (x, y, pw, ph) => {
        drawMinimalRadar(x + pw * .50, y + ph * .54, Math.min(pw * .34, ph * .38), time);
      });
      drawInsidePanel(panels.bars, (x, y, pw, ph) => {
        drawBars(x + pw * .08, y + ph * .18, pw * .84, ph * .70, time);
      });
      drawInsidePanel(panels.network, (x, y, pw, ph) => {
        drawNetwork(x + pw * .03, y + ph * .04, pw * .94, ph * .90, time);
      });
      drawInsidePanel(panels.chart, (x, y, pw, ph) => {
        drawLine(state.charts[0], [x + pw * .06, y + ph * .18, pw * .88, ph * .68], time, 'rgba(126,226,255,.52)', 1.6, 0);
      });
      drawInsidePanel(panels.city, (x, y, pw, ph) => {
        drawMapPulses(x + pw * .05, y + ph * .08, pw * .90, ph * .84, time);
      });
      drawInsidePanel(panels.micro, (x, y, pw, ph) => {
        drawCompactMetrics(x + pw * .05, y + ph * .08, pw * .90, ph * .84, time);
      });
      drawInsidePanel(panels.world, (x, y, pw, ph) => {
        drawMapPulses(x + pw * .04, y + ph * .08, pw * .92, ph * .84, time);
      });
      drawExistingScreenGestures(w, h, time, panels);
      ctx.restore();
    }
    if ('IntersectionObserver' in window) {
      const visibilityObserver = new IntersectionObserver((entries) => {
        nativeWallVisible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0);
        if (nativeWallVisible && !document.hidden && !document.body.classList.contains('app-open')) {
          drawNativeWallFrame(performance.now());
        }
      }, { rootMargin:'140px 0px', threshold:[0, .01] });
      visibilityObserver.observe(canvas);
    }
    function loop(time){
      const profile = currentVisualPerformanceProfile();
      if (document.hidden || document.body.classList.contains('app-open') || !nativeWallVisible || profile.wallCanvas === false) {
        nativeWallFrame = window.setTimeout(() => {
          nativeWallFrame = window.requestAnimationFrame(loop);
        }, profile.wallIdleMs || 720);
        return;
      }
      if (reducedMotion && nativeWallLastPaint) {
        nativeWallFrame = window.requestAnimationFrame(loop);
        return;
      }
      if (!reducedMotion && time - nativeWallLastPaint < (profile.wallFrameMs || 185)) {
        nativeWallFrame = window.requestAnimationFrame(loop);
        return;
      }
      nativeWallLastPaint = time;
      drawNativeWallFrame(time);
      nativeWallFrame = window.requestAnimationFrame(loop);
    }
    nativeWallFrame = window.requestAnimationFrame(loop);
    const queueNativeWallResize = () => {
      if (nativeWallResizeFrame) return;
      nativeWallResizeFrame = window.requestAnimationFrame(() => {
        nativeWallResizeFrame = 0;
        if (document.hidden || document.body.classList.contains('app-open')) return;
        if (currentVisualPerformanceProfile().wallCanvas === false) return;
        drawNativeWallFrame(performance.now());
      });
    };
    window.addEventListener('resize', queueNativeWallResize, { passive:true });
    window.addEventListener('orientationchange', queueNativeWallResize, { passive:true });
  }
  function shouldRunNativeWallCanvas(){
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const compactViewport = window.matchMedia?.('(max-width: 1080px)')?.matches;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const saveData = Boolean(connection?.saveData);
    const slowConnection = typeof connection?.effectiveType === 'string' && /(^|-)2g$|slow-2g/i.test(connection.effectiveType);
    return currentVisualPerformanceProfile().wallCanvas !== false && nativeWallCanvasCanPaint() && !reducedMotion && !compactViewport && !saveData && !slowConnection;
  }
  function scheduleNativeWallCanvasStart(){
    if (nativeWallEngineStarted || nativeWallStartScheduled) return;
    nativeWallStartScheduled = true;
    const start = () => {
      nativeWallStartScheduled = false;
      if (nativeWallEngineStarted || document.body.classList.contains('app-open')) return;
      if (!shouldRunNativeWallCanvas()) return;
      startNativeWallCanvas();
    };
    const idle = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 900));
    window.setTimeout(() => idle(start, { timeout:1800 }), 220);
  }
  function commandRows(query = ''){
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return moduleCards().map((card) => {
      const meta = findMeta(card);
      const title = meta.title[lang()] || meta.title.pl;
      const haystack = searchText(meta, title);
      const visible = !card.hidden && (!tokens.length || tokens.every((token) => haystack.includes(token)));
      let score = 0;
      if (tokens.length) {
        tokens.forEach((token) => {
          if (title.toLowerCase().startsWith(token)) score += 20;
          if (title.toLowerCase().includes(token)) score += 10;
          if (meta.category.toLowerCase().includes(token)) score += 6;
          if (haystack.includes(token)) score += 2;
        });
      }
      return { card, meta, title, visible, score };
    }).filter(item => item.visible).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  }
  function renderCommandList(query = ''){
    const list = document.querySelector('.rw-v2-command-list');
    if (!list) return;
    const rows = commandRows(query);
    list.innerHTML = rows.length ? rows.map((item, index) => `
      <button type="button" class="rw-v2-command-item${index === 0 ? ' is-active' : ''}" data-rw-command-index="${index}">
        <span class="rw-v2-command-icon">${icons[item.meta.icon] || icons.project}</span>
        <span class="rw-v2-command-text"><span>${item.title}</span><small>${categoryLabel(item.meta.category)} / ${moduleStatus(item.meta)}</small></span>
        <span class="rw-v2-command-arrow">&nearr;</span>
      </button>`).join('') : `<div class="rw-v2-command-empty">${uiText('commandEmpty')}</div>`;
    list.querySelectorAll('[data-rw-command-index]').forEach((button, index) => {
      button.addEventListener('click', () => {
        const item = rows[index];
        closeCommandPalette();
        item?.card?.querySelector('.btn')?.click();
      });
    });
  }
  function renderCommandUi(){
    const trigger = document.querySelector('.rw-v2-command-trigger');
    if (trigger) trigger.innerHTML = `<span>${uiText('command')}</span>`;
    const palette = document.querySelector('.rw-v2-command-palette');
    const title = palette?.querySelector('.rw-v2-command-head strong');
    const input = palette?.querySelector('.rw-v2-command-input');
    if (title) title.textContent = uiText('commandTitle');
    if (input) input.placeholder = uiText('commandHint');
    renderSystemStrip();
    scheduleCommandPosition();
  }
  function positionCommandTrigger(){
    const trigger = document.querySelector('.rw-v2-command-trigger');
    const langControls = document.querySelector('.rw-v2-floating-lang');
    if (!trigger || !langControls || document.body.classList.contains('app-open')) return;
    const langRect = langControls.getBoundingClientRect();
    if (!langRect.width || !langRect.height) return;
    const centerX = langRect.left + langRect.width / 2;
    const top = langRect.bottom + 10;
    trigger.style.setProperty('left', `${Math.round(centerX)}px`, 'important');
    trigger.style.setProperty('right', 'auto', 'important');
    trigger.style.setProperty('top', `${Math.round(top)}px`, 'important');
    trigger.style.setProperty('position', 'fixed', 'important');
    trigger.style.setProperty('transform', 'translateX(-50%)', 'important');
  }
  function scheduleCommandPosition(){
    [0, 40, 160, 420, 900, 1600].forEach((delay) => {
      window.setTimeout(() => window.requestAnimationFrame(positionCommandTrigger), delay);
    });
    try {
      document.fonts?.ready?.then(() => positionCommandTrigger());
    } catch (_e) {}
  }
  function updateWallClock(){
    const clock = document.querySelector('.rw-v2-wall-clock');
    if (!clock) return;
    if (!clock.querySelector('.rw-v2-wall-clock-time')) {
      clock.innerHTML = '<span class="rw-v2-wall-clock-kicker">LOCAL // TIME</span><span class="rw-v2-wall-clock-time"></span><span class="rw-v2-wall-clock-date"></span>';
    }
    const now = new Date();
    updateDaylightScene(now);
    const locale = lang() === 'nl' ? 'nl-NL' : lang() === 'en' ? 'en-GB' : 'pl-PL';
    const date = new Intl.DateTimeFormat(locale, { weekday:'short', day:'2-digit', month:'short', year:'numeric' }).format(now);
    const time = clock.querySelector('.rw-v2-wall-clock-time');
    if (!time.querySelector('.rw-v2-wall-clock-hour') || !time.querySelector('.rw-v2-clock-dot')) {
      time.innerHTML = '<span class="rw-v2-wall-clock-hour"></span><span class="rw-v2-wall-clock-colon" aria-hidden="true"><i class="rw-v2-clock-dot"></i><i class="rw-v2-clock-dot"></i></span><span class="rw-v2-wall-clock-minute"></span>';
    }
    time.querySelector('.rw-v2-wall-clock-hour').textContent = String(now.getHours()).padStart(2, '0');
    time.querySelector('.rw-v2-wall-clock-minute').textContent = String(now.getMinutes()).padStart(2, '0');
    time.querySelector('.rw-v2-wall-clock-colon')?.classList.toggle('is-dim', now.getSeconds() % 2 === 1);
    clock.querySelector('.rw-v2-wall-clock-date').textContent = date.replace(/\.$/, '');
  }

  function clampNumber(value, min, max){
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  }

  function defaultWeather(){
    return { state:'cloudy', cloudCover:.55, precipitation:0, fetchedAt:0, code:3 };
  }

  function readWeatherCache(){
    if (weatherState) return weatherState;
    try {
      const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || 'null');
      if (cached && Date.now() - Number(cached.fetchedAt || 0) < WEATHER_REFRESH_MS) {
        weatherState = cached;
        return weatherState;
      }
    } catch (_) {}
    weatherState = defaultWeather();
    return weatherState;
  }

  function normalizeWeather(payload){
    const current = payload?.current || {};
    const daily = payload?.daily || {};
    const code = Number(current.weather_code ?? 3);
    const cloudCover = clampNumber(Number(current.cloud_cover ?? 55) / 100, 0, 1);
    const precipitation = clampNumber(
      (Number(current.precipitation || 0) + Number(current.rain || 0) + Number(current.showers || 0) + Number(current.snowfall || 0)) / 3,
      0,
      1
    );
    let state = 'clear';
    if ([45, 48].includes(code)) state = 'fog';
    else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) state = 'rain';
    else if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) state = 'snow';
    else if (cloudCover > .68) state = 'cloudy';
    else if (cloudCover > .32) state = 'partly-cloudy';
    return {
      state,
      cloudCover,
      precipitation,
      code,
      isDay:Number(current.is_day ?? 1),
      sunrise: Array.isArray(daily.sunrise) ? daily.sunrise[0] : '',
      sunset: Array.isArray(daily.sunset) ? daily.sunset[0] : '',
      fetchedAt:Date.now()
    };
  }

  function refreshWeather(){
    if (weatherRequest || !window.fetch) return;
    if (Date.now() < weatherRefreshAllowedAt) return;
    const cached = readWeatherCache();
    if (Date.now() - Number(cached.fetchedAt || 0) < WEATHER_REFRESH_MS) return;
    if (Date.now() - weatherLastAttempt < 5 * 60 * 1000) return;
    weatherLastAttempt = Date.now();
    weatherRequest = fetch(NL_WEATHER_URL, { cache:'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('weather')))
      .then(payload => {
        weatherState = normalizeWeather(payload);
        try { localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(weatherState)); } catch (_) {}
        updateDaylightScene(new Date());
      })
      .catch(() => {})
      .finally(() => { weatherRequest = null; });
  }
  function scheduleWeatherRefresh(){
    if (weatherRefreshScheduled) return;
    weatherRefreshScheduled = true;
    const idle = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 6000));
    idle(() => {
      weatherRefreshScheduled = false;
      refreshWeather();
    }, { timeout: 12000 });
  }

  function applyWeatherClass(state){
    const known = ['clear', 'partly-cloudy', 'cloudy', 'rain', 'snow', 'fog'];
    known.forEach(name => document.body.classList.remove(`rw-v2-weather-${name}`));
    document.body.classList.add(`rw-v2-weather-${state || 'cloudy'}`);
  }

  function getAmsterdamTimeParts(now = new Date()){
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone:'Europe/Amsterdam',
      year:'numeric',
      month:'2-digit',
      day:'2-digit',
      hour:'2-digit',
      minute:'2-digit',
      second:'2-digit',
      hour12:false,
      hourCycle:'h23'
    }).formatToParts(now).reduce((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = Number(part.value);
      return acc;
    }, {});
    const year = parts.year || now.getFullYear();
    const month = parts.month || (now.getMonth() + 1);
    const dayOfMonth = parts.day || now.getDate();
    const start = Date.UTC(year, 0, 0);
    const current = Date.UTC(year, month - 1, dayOfMonth);
    return {
      year,
      month,
      dayOfMonth,
      dayOfYear:Math.floor((current - start) / 86400000),
      hour:(parts.hour || 0) + (parts.minute || 0) / 60 + (parts.second || 0) / 3600
    };
  }

  function updateDaylightScene(now = new Date()){
    const shell = document.querySelector('.rw-v2-shell');
    if (!shell) return;
    const weather = readWeatherCache();
    scheduleWeatherRefresh();
    const amsterdam = getAmsterdamTimeParts(now);
    const day = amsterdam.dayOfYear;
    const hour = amsterdam.hour;
    const daylightHours = 12 + 4.35 * Math.cos((2 * Math.PI * (day - 172)) / 365);
    const apiSunrise = weather.sunrise ? new Date(weather.sunrise) : null;
    const apiSunset = weather.sunset ? new Date(weather.sunset) : null;
    const apiSunriseHour = apiSunrise && !Number.isNaN(apiSunrise.getTime()) ? apiSunrise.getHours() + apiSunrise.getMinutes() / 60 : null;
    const apiSunsetHour = apiSunset && !Number.isNaN(apiSunset.getTime()) ? apiSunset.getHours() + apiSunset.getMinutes() / 60 : null;
    const solarNoon = 13.65;
    const sunrise = apiSunriseHour ?? (solarNoon - daylightHours / 2);
    const sunset = apiSunsetHour ?? (solarNoon + daylightHours / 2);
    const dawnStart = sunrise - .75;
    const duskEnd = sunset + .25;
    const dayProgress = clampNumber((hour - sunrise) / daylightHours, 0, 1);
    const morningFade = clampNumber((hour - dawnStart) / Math.max(0.1, sunrise - dawnStart), 0, 1);
    const eveningFade = clampNumber((sunset - hour) / Math.max(0.1, sunset - (sunset - .55)), 0, 1);
    const apiNight = weather.isDay === 0;
    const sunVisible = !apiNight && hour >= dawnStart && hour <= sunset ? clampNumber(Math.min(morningFade, eveningFade) * 1.15, 0, 1) : 0;
    const afterDusk = hour > duskEnd;
    const beforeDawn = hour < dawnStart;
    const nightAmount = afterDusk ? clampNumber((hour - duskEnd) / 1.15, 0, 1)
      : beforeDawn ? clampNumber((dawnStart - hour) / 1.15, 0, 1)
      : 0;
    const sunElevation = Math.max(0, Math.sin(dayProgress * Math.PI));
    const weatherSun = clampNumber(1 - weather.cloudCover * .76 - weather.precipitation * .34, .05, 1);
    const sunX = 70 + dayProgress * 23;
    const sunY = 62 - sunElevation * 52;
    const moonProgress = hour > sunset ? clampNumber((hour - sunset) / (24 - sunset + sunrise), 0, 1) : clampNumber((hour + 24 - sunset) / (24 - sunset + sunrise), 0, 1);
    const moonX = 92 - moonProgress * 25;
    const moonY = 15 + Math.sin(moonProgress * Math.PI) * 10;
    const phase = hour < dawnStart || hour > duskEnd ? 'night'
      : hour < sunrise + 1.15 ? 'dawn'
      : hour < Math.min(10.5, solarNoon - 1.2) ? 'morning'
      : hour < solarNoon + 2.15 ? 'day'
      : hour < sunset - 1.45 ? 'afternoon'
      : 'sunset';
    document.body.classList.remove('rw-v2-phase-night', 'rw-v2-phase-dawn', 'rw-v2-phase-morning', 'rw-v2-phase-day', 'rw-v2-phase-afternoon', 'rw-v2-phase-sunset');
    document.body.classList.add(`rw-v2-phase-${phase}`);
    applyWeatherClass(weather.state);
    shell.style.setProperty('--rw-sun-x', `${sunX.toFixed(2)}%`);
    shell.style.setProperty('--rw-sun-y', `${sunY.toFixed(2)}%`);
    shell.style.setProperty('--rw-moon-x', `${moonX.toFixed(2)}%`);
    shell.style.setProperty('--rw-moon-y', `${moonY.toFixed(2)}%`);
    shell.style.setProperty('--rw-sun-opacity', (sunVisible * (.18 + sunElevation * .56) * weatherSun).toFixed(3));
    shell.style.setProperty('--rw-sun-size', `${(58 + sunElevation * 58).toFixed(1)}px`);
    shell.style.setProperty('--rw-cloud-opacity', clampNumber(.025 + weather.cloudCover * .22 + (weather.state === 'fog' ? .10 : 0), 0, .30).toFixed(3));
    shell.style.setProperty('--rw-rain-opacity', clampNumber(weather.precipitation * .50 + (weather.state === 'rain' ? .18 : 0), 0, .58).toFixed(3));
    shell.style.setProperty('--rw-stars-opacity', clampNumber(nightAmount * (1 - weather.cloudCover * .72) * (1 - weather.precipitation), 0, .46).toFixed(3));
    shell.style.setProperty('--rw-moon-opacity', clampNumber(nightAmount * (1 - weather.cloudCover * .65) * .56, 0, .56).toFixed(3));
    shell.style.setProperty('--rw-window-night', clampNumber(nightAmount, 0, 1).toFixed(3));
    shell.style.setProperty('--rw-reflection-sun', (sunVisible * weatherSun * (0.026 + sunElevation * .024)).toFixed(3));
  }
  function openCommandPalette(){
    const palette = document.querySelector('.rw-v2-command-palette');
    const input = palette?.querySelector('.rw-v2-command-input');
    if (!palette || !input || document.body.classList.contains('app-open')) return;
    palette.hidden = false;
    palette.classList.add('is-open');
    document.body.classList.add('rw-v2-command-open');
    renderCommandUi();
    renderCommandList('');
    input.value = '';
    setTimeout(() => input.focus(), 30);
  }
  function closeCommandPalette(){
    const palette = document.querySelector('.rw-v2-command-palette');
    if (!palette) return;
    palette.classList.remove('is-open');
    document.body.classList.remove('rw-v2-command-open');
    palette.hidden = true;
  }
  function renderContact(){
    const contact = document.querySelector('.rw-v2-contact');
    if (!contact) return;
    contactRenderScheduled = false;
    contact.innerHTML = `<div class="rw-v2-contact-copy">
      <span>${t('contactTitle')}</span>
      <a href="mailto:rafalw898@gmail.com">rafalw898@gmail.com</a>
      <p>${t('contactIntro')}</p>
    </div>
    <form class="rw-v2-contact-form" action="${CONTACT_ENDPOINT || '#'}" method="POST">
      <label><span>${t('contactName')}</span><input name="name" autocomplete="name" required></label>
      <label><span>${t('contactEmail')}</span><input type="email" name="email" autocomplete="email" required></label>
      <label class="rw-v2-contact-message"><span>${t('contactMessage')}</span><textarea name="message" rows="4" required></textarea></label>
      <label class="rw-v2-contact-honeypot"><span>Website</span><input name="website" autocomplete="off" tabindex="-1"></label>
      <button type="submit">${t('contactSend')}</button>
    </form>`;
  }
  function scheduleContactRender(){
    if (contactRenderScheduled) return;
    contactRenderScheduled = true;
    const idle = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 1200));
    idle(renderContact, { timeout: 2500 });
  }
  function getContactEndpoint(){
    return String(window.RW_CONTACT_ENDPOINT || CONTACT_ENDPOINT || '').trim();
  }
  function contactMailto(form){
    const data = new FormData(form);
    const subject = encodeURIComponent('Rafal Wilk Digital Workshop - contact request');
    const body = encodeURIComponent(`Imie: ${data.get('name') || ''}\nEmail: ${data.get('email') || ''}\n\n${data.get('message') || ''}`);
    window.location.href = `mailto:rafalw898@gmail.com?subject=${subject}&body=${body}`;
  }
  async function submitContactForm(form){
    const data = new FormData(form);
    if (data.get('website')) return;
    const endpoint = getContactEndpoint();
    if (!endpoint) {
      window.alert(t('contactFallback'));
      contactMailto(form);
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    const original = button?.textContent || t('contactSend');
    if (button) {
      button.disabled = true;
      button.textContent = t('contactSending');
    }
    try {
      const response = await fetch(endpoint, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Accept:'application/json' },
        body:JSON.stringify({
          name:String(data.get('name') || '').trim(),
          email:String(data.get('email') || '').trim(),
          message:String(data.get('message') || '').trim(),
          lang:lang(),
          page:window.location.href
        })
      });
      if (!response.ok) throw new Error('contact-send-failed');
      form.reset();
      window.alert(t('contactSent'));
      window.scrollTo({ top:0, behavior:'smooth' });
    } catch(_error) {
      window.alert(t('contactError'));
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = original;
      }
    }
  }
  function ensureOpenAppBridge(){
    window.openApp = function(id, title){
      openModuleFrame(id, title);
    };
  }
  let modulePinPendingOpen = null;
  let modulePinAuthorizedOnce = false;
  const DEFAULT_MODULE_PIN = '135';
  const MERIT_EXCEL_PIN = '4685';
  function modulePinFor(moduleTitle){
    const title = String(moduleTitle || '').toLowerCase();
    return title.includes('merit excel') ? MERIT_EXCEL_PIN : DEFAULT_MODULE_PIN;
  }
  function activeModulePin(){
    const gate = document.getElementById('mc_gate');
    return modulePinFor(activeModuleTitle || gate?.dataset.rwModuleTitle || '');
  }
  function configurePinInput(input, pin = activeModulePin()){
    if (!input) return;
    const pinLength = String(pin || DEFAULT_MODULE_PIN).length;
    input.maxLength = pinLength;
    input.placeholder = '\u2022'.repeat(pinLength);
  }
  function setPinDigitLength(pinLength){
    const count = Math.max(1, Number(pinLength) || DEFAULT_MODULE_PIN.length);
    const gate = document.getElementById('mc_gate');
    const digits = document.querySelector('.rw-v2-pin-digits');
    gate?.style.setProperty('--rw-pin-length', String(count));
    digits?.style.setProperty('--rw-pin-length', String(count));
    if (!digits) return;
    while (digits.children.length < count) {
      const digit = document.createElement('span');
      digit.className = 'rw-v2-pin-digit';
      digits.appendChild(digit);
    }
    while (digits.children.length > count) {
      digits.lastElementChild?.remove();
    }
  }
  window.__rwModulePinForTitle = modulePinFor;
  window.__rwModulePinLengthForTitle = (moduleTitle) => modulePinFor(moduleTitle).length;
  function pinGateParts(){
    const gate = document.getElementById('mc_gate');
    return {
      gate,
      panel: gate?.querySelector('.panel') || null,
      pin: document.getElementById('mc_pin'),
      err: document.getElementById('mc_err'),
      ok: document.getElementById('mc_ok'),
      cancel: document.getElementById('mc_cancel'),
      title: document.getElementById('mc_title'),
      text: gate?.querySelector('p') || null
    };
  }
  function ensureModulePinGate(){
    window.__rwModulePinConsume = function(){
      if (!modulePinAuthorizedOnce) return false;
      modulePinAuthorizedOnce = false;
      return true;
    };
    window.__rwRequestModulePin = function(callback, moduleTitle){
      modulePinPendingOpen = callback;
      modulePinAuthorizedOnce = false;
      activeModuleTitle = moduleTitle || '';
      const parts = pinGateParts();
      const displayTitle = activeModuleTitle || t('pinText');
      if (parts.gate) {
        parts.gate.dataset.rwModuleTitle = activeModuleTitle;
        parts.gate.style.display = 'flex';
        parts.gate.setAttribute('aria-hidden', 'false');
      }
      const expectedPin = modulePinFor(activeModuleTitle);
      if (parts.title) parts.title.textContent = t('pinTitle');
      if (parts.text) parts.text.textContent = activeModuleTitle ? `${t('pinText').replace(/\.$/, '')}: ${displayTitle}` : t('pinText');
      if (parts.err) parts.err.textContent = '';
      if (parts.pin) {
        configurePinInput(parts.pin, expectedPin);
        setPinDigitLength(expectedPin.length);
        parts.pin.value = '';
        parts.pin.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => {
          try { parts.pin.focus({ preventScroll: true }); } catch (_e) { parts.pin.focus(); }
          parts.pin.select?.();
        }, 0);
      }
      updatePinDigits();
    };
    bindModulePinGate();
  }
  function bindModulePinGate(){
    const parts = pinGateParts();
    if (!parts.gate || !parts.pin || parts.gate.dataset.rwPinBound === 'true') return;
    parts.gate.dataset.rwPinBound = 'true';
    const closeGate = () => {
      modulePinPendingOpen = null;
      modulePinAuthorizedOnce = false;
      parts.gate.style.display = 'none';
      parts.gate.setAttribute('aria-hidden', 'true');
      parts.gate.classList.remove('rw-v2-pin-error');
    };
    const expectedPin = () => activeModulePin();
    const tryUnlock = () => {
      if (parts.pin.value === expectedPin()) {
        parts.gate.style.display = 'none';
        parts.gate.setAttribute('aria-hidden', 'true');
        parts.gate.classList.remove('rw-v2-pin-error');
        modulePinAuthorizedOnce = true;
        const next = modulePinPendingOpen;
        modulePinPendingOpen = null;
        if (typeof next === 'function') next();
        return;
      }
      if (parts.err) parts.err.textContent = t('wrongPin');
      parts.gate.classList.add('rw-v2-pin-error');
      setTimeout(() => parts.gate.classList.remove('rw-v2-pin-error'), 500);
      parts.pin.value = '';
      parts.pin.dispatchEvent(new Event('input', { bubbles: true }));
      try { parts.pin.focus({ preventScroll: true }); } catch (_e) { parts.pin.focus(); }
    };
    parts.ok?.addEventListener('click', tryUnlock);
    parts.cancel?.addEventListener('click', closeGate);
    parts.pin.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') tryUnlock();
      if (event.key === 'Escape') closeGate();
    });
    parts.pin.addEventListener('input', () => {
      const pin = expectedPin();
      parts.pin.value = parts.pin.value.replace(/\D/g, '').slice(0, pin.length);
      if (parts.pin.value === pin) tryUnlock();
    });
  }
  function openModuleFrame(id, title){
    ensureModulePinGate();
    if (!window.__rwModulePinConsume || !window.__rwModulePinConsume()){
      if (window.__rwRequestModulePin) {
        window.__rwRequestModulePin(() => openModuleFrame(id, title), title || id || 'Module');
      }
      return;
    }
    try {
      if (window.__rwSaveActiveFrame && id && id !== 'appframe') window.__rwSaveActiveFrame(id, title || '');
    } catch (_e) {}
    document.querySelectorAll('iframe').forEach((frame) => frame.classList.remove('show'));
    const frame = document.getElementById(id);
    if (frame) {
      if (!frame.getAttribute('src') && frame.dataset.src) frame.setAttribute('src', frame.dataset.src);
      frame.classList.add('show');
    }
    const viewport = document.querySelector('.viewport');
    if (viewport) viewport.classList.add('active');
    document.body.classList.add('app-open');
    const placeholder = document.querySelector('.viewport .placeholder');
    if (placeholder) placeholder.style.display = 'none';
    if (title) document.title = `Rafal Wilk Digital Workshop (c) - ${title}`;
    if (window.__rwSetActiveApp) window.__rwSetActiveApp(title || '', id || '');
    scheduleLanguagePush(lang());
  }
  function enhanceCards(){
    document.querySelectorAll('main.wrap .grid .card').forEach((card, index) => {
      const meta = findMeta(card);
      card.dataset.category = meta.category;
      card.dataset.moduleMatch = meta.match;
      card.style.setProperty('--rw-card-index', index);
      let icon = card.querySelector('.rw-v2-icon');
      if (!icon) {
        icon = document.createElement('div');
        icon.className = 'rw-v2-icon';
        card.insertBefore(icon, card.firstChild);
      }
      let dots = card.querySelector('.rw-v2-window-dots');
      if (!dots) {
        dots = document.createElement('div');
        dots.className = 'rw-v2-window-dots';
        dots.innerHTML = '<span></span><span></span><span></span><span></span>';
        card.insertBefore(dots, icon);
      }
      icon.innerHTML = icons[meta.icon] || icons.project;
      card.querySelector('.rw-v2-card-meta')?.remove();
      card.querySelector('.rw-v2-card-desc')?.remove();
      const title = card.querySelector('.title');
      const titleText = moduleTitle(meta);
      if (title) title.textContent = titleText;
      card.querySelector('.rw-v2-card-status')?.remove();
      card.classList.add('rw-v2-card-clickable');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `${t('open')} ${titleText}`);
      const btn = card.querySelector('.btn');
      if (btn) {
        const label = `${t('open')} ${titleText}`;
        btn.classList.add('rw-v2-card-open');
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
        btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7"/><path d="M9 7h8v8"/></svg>';
      }
      card.hidden = activeFilter !== 'all' && meta.category !== activeFilter;
    });
  }
  function enhancePin(){
    const gate = document.getElementById('mc_gate');
    const panel = gate?.querySelector('.panel');
    const input = document.getElementById('mc_pin');
    if (!gate || !panel || !input) return;
    gate.classList.add('rw-v2-pin-gate');
    if (!panel.querySelector('.rw-v2-pin-head')) {
      const head = document.createElement('div');
      head.className = 'rw-v2-pin-head';
      head.innerHTML = `<div class="rw-v2-pin-icon">${icons.project}</div>`;
      panel.insertBefore(head, panel.firstChild);
    }
    if (!panel.querySelector('.rw-v2-pin-digits')) {
      const digits = document.createElement('div');
      digits.className = 'rw-v2-pin-digits';
      input.insertAdjacentElement('afterend', digits);
    }
    if (!panel.querySelector('.rw-v2-pin-status')) {
      const status = document.createElement('div');
      status.className = 'rw-v2-pin-status';
      input.insertAdjacentElement('beforebegin', status);
    }
    configurePinInput(input);
    setPinDigitLength(activeModulePin().length);
    input.addEventListener('input', updatePinDigits);
    input.addEventListener('focus', updatePinDigits);
    input.addEventListener('blur', updatePinDigits);
    gate.addEventListener('click', (event) => {
      if (!event.target.closest('button')) input.focus();
    });
    updatePinDigits();
  }
  function updatePinDigits(){
    const input = document.getElementById('mc_pin');
    const gate = document.getElementById('mc_gate');
    const pin = activeModulePin();
    const pinLength = pin.length;
    configurePinInput(input, pin);
    setPinDigitLength(pinLength);
    const digits = document.querySelectorAll('.rw-v2-pin-digit');
    const value = String(input?.value || '').slice(0, pinLength);
    if (input && input.value !== value) input.value = value;
    const status = document.querySelector('.rw-v2-pin-status');
    const focused = document.activeElement === input;
    gate?.classList.toggle('rw-v2-pin-waiting', !value.length);
    gate?.classList.toggle('rw-v2-pin-typing', value.length > 0 && value.length < pinLength);
    gate?.classList.toggle('rw-v2-pin-complete', value.length === pinLength);
    digits.forEach((el, i) => {
      el.textContent = value[i] ? '*' : '';
      el.classList.toggle('is-filled', Boolean(value[i]));
      el.classList.toggle('is-active', focused && i === Math.min(value.length, pinLength - 1));
    });
    if (status) {
      const statusText = {
        pl: value.length ? `Wpisano ${value.length}/${pinLength} cyfr` : 'Aktywne pole - wpisz PIN',
        en: value.length ? `${value.length}/${pinLength} digits entered` : 'Active field - enter PIN',
        nl: value.length ? `${value.length}/${pinLength} cijfers ingevoerd` : 'Actief veld - voer pincode in'
      };
      status.textContent = statusText[lang()] || statusText.pl;
    }
  }
  function patchPinTexts(){
    const title = document.getElementById('mc_title');
    const text = document.querySelector('#mc_gate p');
    const cancel = document.getElementById('mc_cancel');
    const ok = document.getElementById('mc_ok');
    const gate = document.getElementById('mc_gate');
    const module = String(activeModuleTitle || gate?.dataset.rwModuleTitle || '').trim();
    const pinText = {
      pl: module ? `Wpisz PIN, aby otworzyć: ${module}` : 'Wpisz PIN, aby otworzyć wybrany moduł.',
      en: module ? `Enter PIN to open: ${module}` : 'Enter PIN to open this module.',
      nl: module ? `Voer de pincode in voor: ${module}` : 'Voer de pincode in om deze module te openen.'
    };
    const desiredTitle = t('pinTitle');
    const desiredText = pinText[lang()] || pinText.pl;
    const desiredCancel = t('cancel');
    const desiredOk = t('unlock');
    if (title && title.textContent !== desiredTitle) title.textContent = desiredTitle;
    if (text && text.textContent !== desiredText) text.textContent = desiredText;
    if (cancel && cancel.textContent !== desiredCancel) cancel.textContent = desiredCancel;
    if (ok && ok.textContent !== desiredOk) ok.textContent = desiredOk;
  }
  function patchPinGateHooks(){
    if (window.__rwV2PinHooks) return;
    window.__rwV2PinHooks = true;
    const originalRequest = window.__rwRequestModulePin;
    if (typeof originalRequest === 'function') {
      window.__rwRequestModulePin = function(callback, moduleTitle){
        activeModuleTitle = moduleTitle || '';
        const gate = document.getElementById('mc_gate');
        if (gate) gate.dataset.rwModuleTitle = activeModuleTitle;
        originalRequest(callback, moduleTitle);
        setTimeout(() => {
          patchPinTexts();
          updatePinDigits();
          const input = document.getElementById('mc_pin');
          input?.focus();
          input?.select?.();
        }, 20);
      };
    }
    const input = document.getElementById('mc_pin');
    const err = document.getElementById('mc_err');
    const gate = document.getElementById('mc_gate');
    const pinTextObserver = new MutationObserver(() => {
      if (!gate || getComputedStyle(gate).display === 'none') return;
      setTimeout(patchPinTexts, 0);
    });
    gate && pinTextObserver.observe(gate, { childList:true, characterData:true, subtree:true, attributes:true, attributeFilter:['style', 'class'] });
    const mo = new MutationObserver(() => {
      if (err && err.textContent) {
        err.textContent = t('wrongPin');
        gate?.classList.add('rw-v2-pin-error');
        setTimeout(() => gate?.classList.remove('rw-v2-pin-error'), 500);
      }
    });
    err && mo.observe(err, { childList:true, characterData:true, subtree:true });
    input?.addEventListener('input', updatePinDigits);
  }
  function ensureModuleBar(){
    if (document.querySelector('.rw-v2-modulebar')) return;
    const bar = document.createElement('div');
    bar.className = 'rw-v2-modulebar';
    bar.innerHTML = `<div class="rw-v2-module-left">
      <button class="rw-v2-back" type="button"></button>
      <div class="rw-v2-module-title"></div>
    </div>
    <div class="rw-v2-module-right">
      <span class="rw-v2-save"></span>
      <div class="rw-v2-module-lang">
        <button type="button" data-lang="pl">PL</button>
        <button type="button" data-lang="en">EN</button>
        <button type="button" data-lang="nl">NL</button>
      </div>
    </div>`;
    document.body.appendChild(bar);
    bar.querySelector('.rw-v2-back').addEventListener('click', () => {
      returnHome();
    });
    bar.querySelectorAll('[data-lang]').forEach(btn => btn.addEventListener('click', () => {
      const nextLang = normalizePlatformLang(btn.dataset.lang || 'pl');
      setPlatformLang(nextLang);
      applyLanguage();
    }));
  }
  function updateModuleBar(){
    const title = document.querySelector('.rw-v2-module-title');
    const back = document.querySelector('.rw-v2-back');
    const save = document.querySelector('.rw-v2-save');
    if (!title || !back || !save) return;
    const docTitle = document.title.split(/\s[-\u2013\u2014]\s/).pop()?.trim();
    title.textContent = docTitle && !docTitle.includes('Rafal') ? docTitle : activeModuleTitle || 'Module';
    back.textContent = t('back');
    save.textContent = t('saved');
    document.querySelectorAll('.rw-v2-module-lang [data-lang]').forEach(btn => {
      btn.setAttribute('aria-pressed', btn.dataset.lang === lang() ? 'true' : 'false');
    });
  }
  function markModuleLaunch(card){
    document.body.classList.add('rw-v2-opening-module');
    card?.classList.add('rw-v2-launching');
    document.querySelector('.rw-v2-transition-veil')?.setAttribute('data-rw-module', activeModuleTitle || '');
    window.setTimeout(() => {
      document.body.classList.remove('rw-v2-opening-module');
      card?.classList.remove('rw-v2-launching');
    }, 900);
  }
  function markHomeReturn(){
    clearTimeout(window.__rwV2HomeReturnTimer);
    document.body.classList.add('rw-v2-returning-home');
    document.querySelector('.rw-v2-transition-veil')?.setAttribute('data-rw-loader', 'SYSTEM RE-SYNC');
    window.__rwV2HomeReturnTimer = window.setTimeout(() => {
      document.body.classList.remove('rw-v2-returning-home');
    }, 3050);
  }
  function returnHome(){
    markHomeReturn();
    try { if (window.__rwClearActiveModule) window.__rwClearActiveModule(); } catch (_e) {}
    document.querySelectorAll('iframe').forEach((frame) => {
      frame.classList.remove('show');
      frame.style.boxShadow = '';
    });
    document.querySelector('.viewport')?.classList.remove('active');
    document.body.classList.remove('app-open');
    activeModuleTitle = '';
    document.title = 'Rafal Wilk Digital Workshop';
    if (window.history?.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    refreshHomeView();
  }
  function applyLanguage(){
    renderHero();
    renderToolbar();
    scheduleContactRender();
    enhanceCards();
    patchPinTexts();
    updateModuleBar();
    syncHomeLang();
    updateWallClock();
  }
  function bindEvents(){
    window.addEventListener('message', (event) => {
      if (!event || !event.data || event.data.type !== 'rw:setLang') return;
      const nextLang = normalizePlatformLang(event.data.lang || 'pl');
      if (nextLang === lang()) {
        syncLegacyLangButtons(nextLang);
        updateModuleBar();
        return;
      }
      setPlatformLang(nextLang);
      applyLanguage();
    });
    document.addEventListener('click', (event) => {
      const homeLang = event.target.closest('[data-rw-home-lang]');
      if (homeLang) {
        event.preventDefault();
        const nextLang = homeLang.dataset.rwHomeLang || 'pl';
        setPlatformLang(nextLang);
        applyLanguage();
        setTimeout(applyLanguage, 120);
        setTimeout(applyLanguage, 700);
        setTimeout(applyLanguage, 1700);
        return;
      }
      if (event.target.closest('[data-rw-command-open]')) {
        event.preventDefault();
        openCommandPalette();
        return;
      }
      if (event.target.closest('[data-rw-command-close]') || event.target.classList?.contains('rw-v2-command-palette')) {
        event.preventDefault();
        closeCommandPalette();
        return;
      }
      const hotspot = event.target.closest('.rw-v2-hotspot');
      if (hotspot) {
        event.preventDefault();
        hotspot.classList.add('rw-v2-hotspot-pulse');
        setTimeout(() => hotspot.classList.remove('rw-v2-hotspot-pulse'), 520);
        return;
      }
      const filter = event.target.closest('.rw-v2-filter');
      if (filter) {
        activeFilter = filter.dataset.filter || 'all';
        applyLanguage();
      }
      if (event.target.closest('[data-rw-v2-open-first]')) {
        document.querySelector('main.wrap .grid .card:not([hidden]) .btn')?.click();
      }
      if (event.target.closest('[data-rw-v2-view-all]')) {
        activeFilter = 'all';
        applyLanguage();
        document.querySelector('.rw-v2-toolbar')?.scrollIntoView({ behavior:'smooth', block:'start' });
      }
      const wholeCard = event.target.closest('main.wrap .grid .card');
      if (wholeCard && !event.target.closest('a, button, input, select, textarea, label, [contenteditable="true"]')) {
        const btn = wholeCard.querySelector('.btn');
        if (btn) {
          event.preventDefault();
          btn.click();
          return;
        }
      }
      const moduleButton = event.target.closest('main.wrap .grid .btn');
      if (moduleButton) {
        const card = moduleButton.closest('.card');
        const meta = card && findMeta(card);
        activeModuleTitle = meta ? (meta.title[lang()] || meta.title.pl) : '';
        markModuleLaunch(card);
        scheduleLanguagePush(lang());
        const inline = moduleButton.getAttribute('onclick') || '';
        const moduleMatch = inline.match(/openApp\('([^']+)'/);
        if (moduleMatch?.[1]) {
          event.preventDefault();
          openModuleFrame(moduleMatch[1], activeModuleTitle || card?.querySelector('.title')?.textContent?.trim() || '');
          return;
        }
        const legacyIdx = moduleButton.getAttribute('data-idx');
        if (legacyIdx !== null && legacyIdx !== '') {
          event.preventDefault();
          const openLegacyModule = () => {
            if (typeof window.loadApp === 'function') {
              window.loadApp(Number(legacyIdx));
            }
          };
          if (!window.__rwModulePinConsume || !window.__rwModulePinConsume()) {
            if (window.__rwRequestModulePin) {
              window.__rwRequestModulePin(openLegacyModule, activeModuleTitle || card?.querySelector('.title')?.textContent?.trim() || 'Module');
            }
          } else {
            openLegacyModule();
          }
          return;
        }
        const protectedHref = moduleButton.getAttribute('href');
        if (protectedHref) {
          event.preventDefault();
          const openProtectedLink = () => {
            const link = document.createElement('a');
            link.href = moduleButton.href;
            if (moduleButton.hasAttribute('download')) {
              link.download = moduleButton.getAttribute('download') || '';
            } else {
              link.target = moduleButton.target || '_self';
            }
            link.rel = moduleButton.rel || 'noopener';
            document.body.appendChild(link);
            link.click();
            link.remove();
          };
          if (!window.__rwModulePinConsume || !window.__rwModulePinConsume()) {
            if (window.__rwRequestModulePin) {
              window.__rwRequestModulePin(openProtectedLink, activeModuleTitle || card?.querySelector('.title')?.textContent?.trim() || 'Module');
            }
          } else {
            openProtectedLink();
          }
          return;
        }
      }
      const globalLangBtn = event.target.closest('.rw-lang-btn');
      if (globalLangBtn) {
        if (globalLangBtn.dataset.lang) {
          setPlatformLang(globalLangBtn.dataset.lang);
        }
        setTimeout(applyLanguage, 40);
      }
    }, true);
    document.addEventListener('submit', (event) => {
      const form = event.target.closest?.('.rw-v2-contact-form');
      if (!form) return;
      event.preventDefault();
      submitContactForm(form);
    });
    window.addEventListener('storage', applyLanguage);
    window.addEventListener('rwLanguageChanged', applyLanguage);
    setInterval(() => {
      if (document.body.classList.contains('app-open')) {
        updateModuleBar();
      }
    }, 10000);
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const card = event.target.closest?.('main.wrap .grid .card');
      if (!card || event.target.closest('a, button, input, select, textarea, label, [contenteditable="true"]')) return;
      const btn = card.querySelector('.btn');
      if (!btn) return;
      event.preventDefault();
      btn.click();
    });
    document.addEventListener('input', (event) => {
      if (!event.target.matches?.('.rw-v2-command-input')) return;
      renderCommandList(event.target.value || '');
    });
    document.addEventListener('keydown', (event) => {
      const palette = document.querySelector('.rw-v2-command-palette.is-open');
      if (palette && event.target.matches?.('.rw-v2-command-input')) {
        const items = Array.from(palette.querySelectorAll('.rw-v2-command-item'));
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && items.length) {
          event.preventDefault();
          const current = Math.max(0, items.findIndex((item) => item.classList.contains('is-active')));
          const next = event.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
          items.forEach((item, index) => item.classList.toggle('is-active', index === next));
          items[next].scrollIntoView({ block:'nearest' });
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          (items.find((item) => item.classList.contains('is-active')) || items[0])?.click();
          return;
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openCommandPalette();
        return;
      }
      if (event.key === 'Escape') closeCommandPalette();
    });
    const bodyObserver = new MutationObserver(updateModuleBar);
    bodyObserver.observe(document.body, { attributes:true, attributeFilter:['class'] });
    setInterval(() => {
      if (document.body.classList.contains('app-open')) updateModuleBar();
    }, 12000);
  }
  let premiumPointerBound = false;
  function bindPremiumPointer(){
    if (premiumPointerBound) return;
    premiumPointerBound = true;
    let raf = 0;
    let nextX = 55;
    let nextY = 38;
    const update = () => {
      raf = 0;
      document.documentElement.style.setProperty('--rw-pointer-x', `${nextX}%`);
      document.documentElement.style.setProperty('--rw-pointer-y', `${nextY}%`);
    };
    window.addEventListener('pointermove', (event) => {
      if (document.body.classList.contains('app-open')) return;
      if (!currentVisualPerformanceProfile().pointerTracking) return;
      nextX = Math.max(0, Math.min(100, (event.clientX / Math.max(1, window.innerWidth)) * 100));
      nextY = Math.max(0, Math.min(100, (event.clientY / Math.max(1, window.innerHeight)) * 100));
      if (!raf) raf = window.requestAnimationFrame(update);
    }, { passive:true });
  }
  function hideStageWidgets(){
    ['rwPlatformApiStatus', 'rwVoiceLauncher', 'rwLauncherDock'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.setAttribute('hidden', '');
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('opacity', '0', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    });
    document.querySelectorAll('.privacy-footer').forEach((el) => {
      el.setAttribute('hidden', '');
      el.style.setProperty('display', 'none', 'important');
    });
  }
  const premiumModuleTheme = `
    :root{
      --rw-bg:#f8fbff; --rw-panel:rgba(255,255,255,.74); --rw-panel-2:rgba(245,250,255,.82);
      --rw-line:rgba(52,104,160,.14); --rw-line-strong:rgba(14,165,233,.24);
      --rw-text:#10233f; --rw-muted:#64748b; --rw-blue:#0ea5e9; --rw-violet:#8b5cf6;
      --rw-cyan:#14b8a6; --rw-danger:#e11d48; --rw-ok:#059669;
      --rw-shadow:0 18px 52px rgba(36,76,128,.10), 0 0 26px rgba(14,165,233,.045);
      color-scheme:light;
    }
    @media screen{
      html{background:#f8fbff!important;}
      body{
        color:var(--rw-text)!important;
        background:
          linear-gradient(115deg, transparent 0 38%, rgba(14,165,233,.055) 43%, transparent 50% 100%),
          linear-gradient(75deg, transparent 0 68%, rgba(139,92,246,.040) 74%, transparent 82% 100%),
          linear-gradient(135deg,#f8fbff 0%,#eef7ff 52%,#e6f0fb 100%)!important;
      }
      body::before{
        content:""; position:fixed; inset:0; pointer-events:none; z-index:-1;
        background:
          linear-gradient(rgba(32,88,142,.055) 1px, transparent 1px),
          linear-gradient(90deg, rgba(32,88,142,.042) 1px, transparent 1px);
        background-size:54px 54px; opacity:.62; mask-image:linear-gradient(to bottom, #000, transparent 82%);
      }
      .app,.shell,.page{max-width:1380px!important;}
      .topbar,.toolbar,.brand,.top-actions{color:var(--rw-text)!important;}
      .logo{
        background:linear-gradient(180deg, #ffffff, #cffafe 36%, #38bdf8 72%, #1d4ed8 100%)!important;
        border:1px solid rgba(14,165,233,.34)!important;
        box-shadow:0 0 32px rgba(14,165,233,.22)!important;
      }
      h1,h2,h3,.card-title,.brand h1,.title{color:var(--rw-text)!important; letter-spacing:-.02em!important;}
      p,.subtitle,.card-description,.section-note,.small,.help,.muted,.meta,.footer{color:var(--rw-muted)!important;}
      .card,.panel,.panel-inner,.doc,.stamp,.note,.info-box,.summary-card,.result-card,.tile,.month-row,.meeting-card,.saved-item,.totals .box,.stat-card,.metric,.empty,.history-list,.pro-receipt{
        background:linear-gradient(145deg, rgba(255,255,255,.82), rgba(247,251,255,.58))!important;
        border:1px solid var(--rw-line)!important;
        border-radius:8px!important;
        box-shadow:var(--rw-shadow)!important;
        backdrop-filter:blur(18px)!important;
      }
      .hero,.layout,.grid-2,.grid-3,.field-grid,.form-grid,.info-strip{gap:18px!important;}
      input,select,textarea{
        background:rgba(255,255,255,.88)!important;
        border:1px solid rgba(52,104,160,.18)!important;
        color:var(--rw-text)!important;
        border-radius:8px!important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.78)!important;
      }
      input:focus,select:focus,textarea:focus{
        outline:none!important; border-color:rgba(14,165,233,.58)!important;
        box-shadow:0 0 0 4px rgba(14,165,233,.14), 0 0 28px rgba(14,165,233,.10)!important;
      }
      label,th{color:#173553!important;}
      button,.btn,.icon-btn,.small-btn,.lang-btn{
        border:1px solid rgba(52,104,160,.18)!important;
        border-radius:8px!important;
        background:linear-gradient(180deg,#ffffff,#dbeafe 52%,#7dd3fc)!important;
        color:#08243d!important;
        box-shadow:0 10px 26px rgba(14,165,233,.10), inset 0 1px 0 rgba(255,255,255,.86)!important;
      }
      .btn.secondary,.btn.soft,.small-btn,.icon-btn{
        background:rgba(255,255,255,.72)!important;
      }
      .btn.danger,.small-btn.delete{background:linear-gradient(180deg,#fb7185,#e11d48)!important;color:#fff!important;}
      .language-switcher,.lang-switch,.rw-tool-lang-ui{
        background:rgba(255,255,255,.74)!important;
        border:1px solid var(--rw-line)!important;
        box-shadow:0 14px 38px rgba(36,76,128,.08)!important;
      }
      .language-switcher button.active,.lang-btn.active,.lang-btn[aria-pressed="true"]{
        background:linear-gradient(180deg,#ffffff,#bfdbfe 54%,#38bdf8)!important;
        color:#06213b!important;
      }
      table{border-collapse:separate!important; border-spacing:0!important; overflow:hidden!important;}
      th,td{border-color:rgba(52,104,160,.14)!important; color:var(--rw-text)!important;}
      th{background:rgba(14,165,233,.08)!important;}
      .progress,.progress-fill{box-shadow:0 0 16px rgba(14,165,233,.08)!important;}
      .progress-fill{background:linear-gradient(90deg,var(--rw-cyan),var(--rw-blue))!important;}
      .chip,.badge{
        border:1px solid rgba(14,165,233,.18)!important;
        background:rgba(14,165,233,.08)!important;
        color:#075985!important;
      }
      .empty,.history-list .empty,.saved-empty{
        background:rgba(255,255,255,.64)!important;
        border:1px solid rgba(52,104,160,.16)!important;
        color:var(--rw-text)!important;
      }
      .tile *,.empty *,.history-list .empty *,.saved-empty *{
        color:var(--rw-text)!important;
      }
      .toast{background:#ffffff!important;color:#10233f!important;border:1px solid var(--rw-line-strong)!important;}
      html.rw-premium-module-root body{
        animation:rwPremiumModuleIn .34s cubic-bezier(.2,.8,.2,1) both;
        min-height:100vh!important;
      }
      html.rw-premium-module-root body::after{
        content:"";
        position:fixed;
        inset:auto 8% 0 8%;
        height:38vh;
        pointer-events:none;
        z-index:-1;
        background:
          radial-gradient(circle at 18% 30%, rgba(14,165,233,.18), transparent 34%),
          radial-gradient(circle at 78% 54%, rgba(139,92,246,.13), transparent 35%);
        filter:blur(24px);
        opacity:.72;
      }
      .topbar,.toolbar,.header,.hero,.page-header{
        background:linear-gradient(135deg, rgba(255,255,255,.80), rgba(226,242,255,.52))!important;
        border:1px solid rgba(87,143,196,.16)!important;
        border-radius:8px!important;
        box-shadow:0 16px 42px rgba(13,42,74,.07)!important;
        backdrop-filter:blur(18px)!important;
      }
      .card,.panel,.panel-inner,.doc,.stamp,.note,.info-box,.summary-card,.result-card,.tile,.month-row,.meeting-card,.saved-item,.totals .box,.stat-card,.metric,.empty,.history-list,.pro-receipt,
      button,.btn,.icon-btn,.small-btn,.lang-btn,input,select,textarea{
        transition:transform .22s ease, box-shadow .22s ease, border-color .22s ease, background .22s ease, color .18s ease!important;
      }
      .card:hover,.panel:hover,.tile:hover,.summary-card:hover,.result-card:hover,.meeting-card:hover,.saved-item:hover,.metric:hover{
        transform:translateY(-2px)!important;
        border-color:rgba(14,165,233,.30)!important;
        box-shadow:0 22px 60px rgba(31,79,125,.13), 0 0 34px rgba(14,165,233,.07)!important;
      }
      button:hover,.btn:hover,.icon-btn:hover,.small-btn:hover,.lang-btn:hover{
        transform:translateY(-1px)!important;
        border-color:rgba(14,165,233,.38)!important;
        box-shadow:0 14px 34px rgba(14,165,233,.15), inset 0 1px 0 rgba(255,255,255,.90)!important;
      }
      button:active,.btn:active,.icon-btn:active,.small-btn:active,.lang-btn:active{
        transform:translateY(0) scale(.99)!important;
      }
      th{
        background:linear-gradient(180deg, rgba(8,35,61,.94), rgba(12,55,88,.90))!important;
        color:#f7fbff!important;
        border-color:rgba(125,211,252,.18)!important;
      }
      td{
        background:rgba(255,255,255,.52)!important;
      }
      tr:nth-child(even) td{
        background:rgba(238,247,255,.68)!important;
      }
      html.rw-premium-module-root .topbar,
      html.rw-premium-module-root .toolbar,
      html.rw-premium-module-root .header,
      html.rw-premium-module-root .page-header{
        position:relative!important;
        overflow:hidden!important;
      }
      html.rw-premium-module-root .topbar::after,
      html.rw-premium-module-root .toolbar::after,
      html.rw-premium-module-root .header::after,
      html.rw-premium-module-root .page-header::after{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        background:linear-gradient(110deg, transparent 0 42%, rgba(14,165,233,.10) 48%, transparent 56% 100%);
      }
      html.rw-premium-module-root h1,
      html.rw-premium-module-root h2,
      html.rw-premium-module-root h3{
        font-weight:760!important;
        letter-spacing:-.018em!important;
      }
      html.rw-premium-module-root .card,
      html.rw-premium-module-root .panel,
      html.rw-premium-module-root .summary-card,
      html.rw-premium-module-root .result-card,
      html.rw-premium-module-root .metric,
      html.rw-premium-module-root .tile{
        position:relative!important;
        overflow:hidden!important;
      }
      html.rw-premium-module-root .card::before,
      html.rw-premium-module-root .panel::before,
      html.rw-premium-module-root .summary-card::before,
      html.rw-premium-module-root .result-card::before,
      html.rw-premium-module-root .metric::before,
      html.rw-premium-module-root .tile::before{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        background:
          linear-gradient(135deg, rgba(255,255,255,.34), transparent 32%),
          radial-gradient(circle at 100% 0, rgba(14,165,233,.10), transparent 30%);
        opacity:.54;
      }
      html.rw-premium-module-root input,
      html.rw-premium-module-root select,
      html.rw-premium-module-root textarea{
        min-height:38px!important;
      }
      html.rw-premium-module-root table{
        box-shadow:0 18px 46px rgba(36,76,128,.08)!important;
        border-radius:8px!important;
      }
      html.rw-premium-module-root .btn.primary,
      html.rw-premium-module-root button.primary,
      html.rw-premium-module-root .btn:not(.secondary):not(.soft):not(.danger){
        background:linear-gradient(180deg,#ffffff 0%,#d9f1ff 42%,#7dd3fc 100%)!important;
      }
      @keyframes rwPremiumModuleIn{
        from{opacity:.72; transform:translateY(8px) scale(.996);}
        to{opacity:1; transform:translateY(0) scale(1);}
      }
    }
    @media (prefers-reduced-motion:reduce){
      html.rw-premium-module-root body,
      .card,.panel,.panel-inner,.doc,.stamp,.note,.info-box,.summary-card,.result-card,.tile,.month-row,.meeting-card,.saved-item,.totals .box,.stat-card,.metric,.empty,.history-list,.pro-receipt,
      button,.btn,.icon-btn,.small-btn,.lang-btn,input,select,textarea{
        animation:none!important;
        transition:none!important;
      }
    }
    @media print{
      body{background:#fff!important;color:#111!important;}
      .doc,.pro-receipt{background:#fff!important;color:#111!important;box-shadow:none!important;}
    }`;
  function rekentoolMeritHtml(){
    let html = String(window.__rwMeritModuleHtml || '');
    if (!html) return '';
    const colors = {
      '#1a73e8':'#fb8c00',
      '#0b57d0':'#c56a00',
      '#4285f4':'#fb8c00',
      '#0d47a1':'#9a3412',
      '#174ea6':'#9a3412',
      '#e8f0fe':'#fff3e0',
      '#d4e3fb':'#fed7aa'
    };
    Object.entries(colors).forEach(([from, to]) => {
      html = html.replace(new RegExp(from, 'gi'), to);
    });
    const theme = `<style id="rw-rekentool-merit-theme">
      html,body{background:#f5f6f8!important;color:#111827!important;font-family:Inter,Arial,Helvetica,sans-serif!important;}
      body{min-height:0!important;overflow-x:hidden!important;}
      .topbar{display:none!important;}
      .hero{
        padding:28px 24px 50px!important;
        background:linear-gradient(135deg,#111827 0%,#273449 72%,#9a3412 100%)!important;
        border-bottom:3px solid #fb8c00!important;
      }
      .hero h1{font-family:Inter,Arial,Helvetica,sans-serif!important;font-weight:800!important;letter-spacing:0!important;}
      main{max-width:none!important;margin:-28px auto 0!important;padding:0 18px 24px!important;}
      .card{
        border:1px solid rgba(17,24,39,.10)!important;
        border-radius:16px!important;
        box-shadow:0 8px 24px rgba(15,23,42,.08)!important;
      }
      .card-header{font-family:Inter,Arial,Helvetica,sans-serif!important;}
      .step-chip{
        color:#9a3412!important;
        background:#fff3e0!important;
        border:1px solid #fed7aa!important;
      }
      button,.md-select,input,select{font-family:Inter,Arial,Helvetica,sans-serif!important;}
      button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid rgba(251,140,0,.24)!important;outline-offset:2px!important;}
      @media(max-width:720px){
        .hero{padding:24px 16px 44px!important;}
        main{padding-left:10px!important;padding-right:10px!important;}
      }
    </style>`;
    return html.replace('</head>', `${theme}</head>`);
  }

  function integrateRekentoolMerit(frame){
    try {
      const outerDoc = frame?.contentDocument;
      const innerFrame = outerDoc?.getElementById('toolFrame');
      if (!innerFrame || !window.__rwMeritModuleHtml) return;

      const install = () => {
        try {
          const doc = innerFrame.contentDocument;
          const oldPanel = doc?.querySelector('section.merit-panel');
          if (!doc || !oldPanel || doc.getElementById('rwMerit2026Replacement')) return;

          let bridgeStyle = doc.getElementById('rw-merit-replacement-style');
          if (!bridgeStyle) {
            bridgeStyle = doc.createElement('style');
            bridgeStyle.id = 'rw-merit-replacement-style';
            bridgeStyle.textContent = `
              section.merit-panel[data-rw-merit-replaced="true"]{display:none!important;}
              .rw-merit-2026-panel{
                display:block!important;
                margin-top:0!important;
                padding:0!important;
                overflow:hidden!important;
                background:#f5f6f8!important;
                border:1px solid rgba(17,24,39,.10)!important;
                border-radius:18px!important;
                box-shadow:0 12px 30px rgba(15,23,42,.09)!important;
              }
              .rw-merit-2026-frame{
                display:block!important;
                width:100%!important;
                min-height:1180px!important;
                margin:0!important;
                padding:0!important;
                border:0!important;
                background:#f5f6f8!important;
              }`;
            doc.head?.appendChild(bridgeStyle);
          }

          oldPanel.setAttribute('data-rw-merit-replaced', 'true');
          const section = doc.createElement('section');
          section.id = 'rwMerit2026Replacement';
          section.className = 'panel rw-merit-2026-panel';
          section.setAttribute('aria-label', 'Merit increase 2026');

          const meritFrame = doc.createElement('iframe');
          meritFrame.className = 'rw-merit-2026-frame';
          meritFrame.title = 'Merit increase 2026';
          meritFrame.srcdoc = rekentoolMeritHtml();
          section.appendChild(meritFrame);
          oldPanel.insertAdjacentElement('afterend', section);

          meritFrame.addEventListener('load', () => {
            const childDoc = meritFrame.contentDocument;
            const childWin = meritFrame.contentWindow;
            if (!childDoc || !childWin) return;

            const resize = () => {
              const height = Math.max(
                childDoc.documentElement?.scrollHeight || 0,
                childDoc.body?.scrollHeight || 0,
                1180
              );
              meritFrame.style.height = `${height}px`;
            };
            resize();
            [80, 300, 900].forEach(delay => setTimeout(resize, delay));
            if (childWin.ResizeObserver) {
              const observer = new childWin.ResizeObserver(resize);
              observer.observe(childDoc.documentElement);
            }

            const currentLang = lang();
            try { childWin.postMessage({type:'rw:setLang', lang:currentLang}, '*'); } catch (_e) {}
            try {
              if (typeof childWin.__rwApplyModuleLang === 'function') childWin.__rwApplyModuleLang(currentLang);
            } catch (_e) {}
          });
        } catch (_e) {}
      };

      install();
      if (!innerFrame.__rwMeritReplacementBound) {
        innerFrame.__rwMeritReplacementBound = true;
        innerFrame.addEventListener('load', () => {
          [40, 180, 600].forEach(delay => setTimeout(install, delay));
        });
      }
    } catch (_e) {}
  }

  function applyPremiumModuleTheme(frame){
    try {
      if (frame?.id === 'redukcja') return;
      const doc = frame?.contentDocument;
      if (!doc || !doc.documentElement) return;
      const srcdoc = frame.getAttribute('srcdoc') || '';
      const isCvMatchModule = /CV Match Offline|cv-input|job-input|scan-shell/.test(srcdoc)
        || /CV Match/i.test(doc.title || '');
      doc.documentElement.classList.toggle('rw-premium-module-root', !isCvMatchModule);
      doc.documentElement.classList.add('rw-platform-embedded');
      if (doc.body) doc.body.classList.toggle('rw-premium-module', !isCvMatchModule);
      let dedupeStyle = doc.getElementById('rw-platform-language-dedup');
      if (!dedupeStyle) {
        dedupeStyle = doc.createElement('style');
        dedupeStyle.id = 'rw-platform-language-dedup';
        dedupeStyle.textContent = `
          html.rw-platform-embedded .language-switcher,
          html.rw-platform-embedded .lang-switch,
          html.rw-platform-embedded .language-controls,
          html.rw-platform-embedded .lang-controls,
          html.rw-platform-embedded .language-selector,
          html.rw-platform-embedded .lang-selector,
          html.rw-platform-embedded [data-rw-embedded-lang-control="true"],
          html.rw-platform-embedded [data-rw-embedded-lang-button="true"]{
            display:none!important;
            visibility:hidden!important;
          }`;
        doc.head?.appendChild(dedupeStyle);
      }
      const hideEmbeddedLanguageControls = () => {
        const candidates = Array.from(doc.querySelectorAll('button,a,[role="button"]'));
        const languageButtons = candidates.filter(element =>
          /^(PL|EN|NL)$/.test((element.textContent || '').trim().toUpperCase())
        );

        languageButtons.forEach(button => {
          let group = button.parentElement;
          let matchedGroup = null;
          for (let depth = 0; group && depth < 5; depth += 1, group = group.parentElement) {
            const labels = Array.from(group.querySelectorAll('button,a,[role="button"]'))
              .map(element => (element.textContent || '').trim().toUpperCase())
              .filter(label => /^(PL|EN|NL)$/.test(label));
            if (new Set(labels).size === 3) {
              matchedGroup = group;
              break;
            }
          }
          if (matchedGroup) {
            matchedGroup.setAttribute('data-rw-embedded-lang-control', 'true');
          } else {
            button.setAttribute('data-rw-embedded-lang-button', 'true');
          }
        });

        doc.querySelectorAll('select').forEach(select => {
          const marker = `${select.id || ''} ${select.name || ''} ${select.className || ''} ${select.getAttribute('aria-label') || ''}`.toLowerCase();
          if (/(lang|language|taal|jezyk|język)/.test(marker)) {
            (select.closest('.field,.form-field,.control,.input-group') || select.parentElement || select)
              .setAttribute('data-rw-embedded-lang-control', 'true');
          }
        });
      };
      hideEmbeddedLanguageControls();
      if (!doc.__rwLanguageDedupeObserver && doc.body) {
        doc.__rwLanguageDedupeObserver = new MutationObserver(hideEmbeddedLanguageControls);
        doc.__rwLanguageDedupeObserver.observe(doc.body, { childList:true, subtree:true });
      }
      integrateRekentoolMerit(frame);
      if (isCvMatchModule) {
        doc.getElementById('rw-premium-module-theme')?.remove();
        return;
      }
      if (doc.getElementById('rw-premium-module-theme')) return;
      const style = doc.createElement('style');
      style.id = 'rw-premium-module-theme';
      style.textContent = premiumModuleTheme;
      doc.head?.appendChild(style);
    } catch (e) {}
  }
  function skinModuleFrames(){
    if (!document.body.classList.contains('app-open')) return;
    document.querySelectorAll('iframe').forEach(applyPremiumModuleTheme);
  }
  let skinFrameRaf = 0;
  function scheduleSkinModuleFrames(){
    if (!document.body.classList.contains('app-open')) return;
    if (skinFrameRaf) return;
    skinFrameRaf = window.requestAnimationFrame(() => {
      skinFrameRaf = 0;
      skinModuleFrames();
    });
  }
  function refreshHomeView(){
    applyVisualPerformanceProfile();
    retireLegacyVisualLayers();
    ensureShell();
    renderHero();
    renderToolbar();
    scheduleContactRender();
    enhanceCards();
    patchPinTexts();
    updateModuleBar();
    syncHomeLang();
    hideStageWidgets();
    updateWallClock();
    document.body.classList.add('rw-v2-ready');
    scheduleNativeWallCanvasStart();
  }
  function init(){
    window.__rwPlatformV2RefreshHome = refreshHomeView;
    bindVisualPerformanceGovernor();
    ensureModulePinGate();
    retireLegacyVisualLayers();
    syncBrand();
    ensureShell();
    scheduleNativeWallCanvasStart();
    bindPremiumPointer();
    updateWallClock();
    setInterval(updateWallClock, 60000);
    window.addEventListener('resize', scheduleCommandPosition, { passive:true });
    ensureOpenAppBridge();
    enhancePin();
    patchPinGateHooks();
    ensureModuleBar();
    bindEvents();
    hideStageWidgets();
    new MutationObserver(() => window.requestAnimationFrame(hideStageWidgets)).observe(document.body, { childList:true, subtree:true });
    if (document.body.classList.contains('app-open')) skinModuleFrames();
    document.querySelectorAll('iframe').forEach(frame => frame.addEventListener('load', () => {
      applyPremiumModuleTheme(frame);
      scheduleLanguagePush(lang());
    }));
    new MutationObserver(scheduleSkinModuleFrames).observe(document.body, { childList:true, subtree:true });
    setInterval(() => {
      if (document.body.classList.contains('app-open')) skinModuleFrames();
    }, 15000);
    applyLanguage();
    document.body.classList.add('rw-v2-ready');
    scheduleCommandPosition();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
