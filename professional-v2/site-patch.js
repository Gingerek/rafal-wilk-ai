(function(){
'use strict';
const EMAIL='rafalwilk.aitech@gmail.com';
const COPY={
  pl:{
    navPlatform:'Platforma',navTools:'Narzędzia',navProjects:'Projekty',navAssistant:'AI Assistant',navContact:'Kontakt',openToolsTop:'Otwórz narzędzia',
    heroKicker:'SMART TOOLS. REAL IMPACT.',heroTitle:'Wszystko, czego potrzebujesz.<br><span>Nic, co przeszkadza.</span>',heroLead:'Skupione środowisko dla kalkulatorów, procesów staffingowych, narzędzi workforce i prywatnych projektów. Zbudowane z myślą o przejrzystości, szybkości i rezultatach.',launchTools:'Otwórz narzędzia',explorePlatform:'Poznaj platformę',metricToolsSub:'Gotowe do użycia',metricSecureStrong:'Bezpieczny dostęp',metricSecure:'Chroniony workspace',
    toolsOverviewLabel:'PRZEGLĄD NARZĘDZI',toolsOverviewTitle:'Praktyczne narzędzia dla staffingu, HR i operacji',viewAllTools:'Pokaż wszystkie narzędzia',
    cardCalculators:'Kalkulatory',cardCalculatorsCopy:'Stawki, budżety, payroll i narzędzia finansowe.',cardStaffing:'Staffing i rekrutacja',cardStaffingCopy:'Workflow, matching, intake i narzędzia CV.',cardWorkforce:'HR i Workforce',cardWorkforceCopy:'Narzędzia workforce, rejestry i trackery.',cardOperations:'Operacje',cardOperationsCopy:'Codzienna praca, planowanie i przeglądy.',cardAnalytics:'Analityka',cardAnalyticsCopy:'Analizy, kalkulacje i narzędzia raportowe.',cardProjects:'Moje projekty',cardProjectsCopy:'Prywatny workspace dla projektów.',
    footerAbout:'Tworzę praktyczne narzędzia AI, automatyzacje i rozwiązania biznesowe, które zamieniają złożoność w konkretne działanie.',footerContact:'Kontakt',footerPlatform:'Platforma',footerAllTools:'Wszystkie narzędzia',footerProjects:'Projekty',footerLegal:'Informacje prawne',linkPrivacy:'Polityka prywatności',linkTerms:'Warunki korzystania',linkDisclaimer:'Zastrzeżenia',linkCopyright:'Prawa autorskie',securityTitle:'Secure & Private',securityCopy:'Chroniony workspace z kontrolowanym dostępem do narzędzi.',rights:'Wszelkie prawa zastrzeżone.',independent:'Niezależna platforma. Nazwy i znaki podmiotów trzecich pozostają własnością ich właścicieli.'
  },
  en:{
    navPlatform:'Platform',navTools:'Tools',navProjects:'Projects',navAssistant:'AI Assistant',navContact:'Contact',openToolsTop:'Open tools',
    heroKicker:'SMART TOOLS. REAL IMPACT.',heroTitle:'Everything you need.<br><span>Nothing in your way.</span>',heroLead:'A focused workspace for calculators, staffing workflows, workforce utilities and private projects. Built for clarity, speed and results.',launchTools:'Launch tools',explorePlatform:'Explore platform',metricToolsSub:'Ready to use',metricSecureStrong:'Secure',metricSecure:'Protected workspace',
    toolsOverviewLabel:'TOOLS OVERVIEW',toolsOverviewTitle:'Powerful tools for staffing, HR and operations',viewAllTools:'View all tools',
    cardCalculators:'Calculators',cardCalculatorsCopy:'Rates, budgets, payroll and financial tools.',cardStaffing:'Staffing & Recruitment',cardStaffingCopy:'Workflows, matching, intake and CV tools.',cardWorkforce:'HR & Workforce',cardWorkforceCopy:'Workforce utilities, registrations and trackers.',cardOperations:'Operations',cardOperationsCopy:'Daily operations, planning and overviews.',cardAnalytics:'Analytics',cardAnalyticsCopy:'Insights, calculations and reporting tools.',cardProjects:'My Projects',cardProjectsCopy:'Private workspace for your projects.',
    footerAbout:'Creating practical AI, automation and business tools that turn complexity into clear action.',footerContact:'Contact',footerPlatform:'Platform',footerAllTools:'All Tools',footerProjects:'Projects',footerLegal:'Legal',linkPrivacy:'Privacy Policy',linkTerms:'Terms of Use',linkDisclaimer:'Disclaimer',linkCopyright:'Copyright',securityTitle:'Secure & Private',securityCopy:'Protected workspace with access-controlled tool entry.',rights:'All rights reserved.',independent:'Independent platform. Third-party names and trademarks remain the property of their respective owners.'
  },
  nl:{
    navPlatform:'Platform',navTools:'Tools',navProjects:'Projecten',navAssistant:'AI Assistant',navContact:'Contact',openToolsTop:'Open tools',
    heroKicker:'SMART TOOLS. REAL IMPACT.',heroTitle:'Alles wat je nodig hebt.<br><span>Niets dat in de weg zit.</span>',heroLead:'Een gerichte workspace voor calculators, staffingworkflows, workforce-tools en privéprojecten. Gebouwd voor duidelijkheid, snelheid en resultaat.',launchTools:'Open tools',explorePlatform:'Ontdek platform',metricToolsSub:'Direct te gebruiken',metricSecureStrong:'Veilig',metricSecure:'Beveiligde workspace',
    toolsOverviewLabel:'TOOLS OVERZICHT',toolsOverviewTitle:'Praktische tools voor staffing, HR en operations',viewAllTools:'Bekijk alle tools',
    cardCalculators:'Calculators',cardCalculatorsCopy:'Tarieven, budgetten, payroll en financiële tools.',cardStaffing:'Staffing & Recruitment',cardStaffingCopy:'Workflows, matching, intake en CV-tools.',cardWorkforce:'HR & Workforce',cardWorkforceCopy:'Workforce-tools, registraties en trackers.',cardOperations:'Operations',cardOperationsCopy:'Dagelijkse operations, planning en overzichten.',cardAnalytics:'Analytics',cardAnalyticsCopy:'Inzichten, berekeningen en rapportagetools.',cardProjects:'Mijn projecten',cardProjectsCopy:'Privéworkspace voor projecten.',
    footerAbout:'Praktische AI-, automatiserings- en business-tools die complexiteit omzetten in duidelijke actie.',footerContact:'Contact',footerPlatform:'Platform',footerAllTools:'Alle tools',footerProjects:'Projecten',footerLegal:'Juridisch',linkPrivacy:'Privacybeleid',linkTerms:'Gebruiksvoorwaarden',linkDisclaimer:'Disclaimer',linkCopyright:'Auteursrecht',securityTitle:'Secure & Private',securityCopy:'Beveiligde workspace met gecontroleerde toegang tot tools.',rights:'Alle rechten voorbehouden.',independent:'Onafhankelijk platform. Namen en merken van derden blijven eigendom van hun respectieve eigenaren.'
  }
};
function lang(){const v=(document.documentElement.lang||localStorage.getItem('rw_lang')||'pl').slice(0,2).toLowerCase();return ['pl','en','nl'].includes(v)?v:'pl'}
function render(){
  const dict=COPY[lang()]||COPY.pl;
  document.querySelectorAll('[data-site-i18n]').forEach(el=>{const v=dict[el.dataset.siteI18n];if(v)el.textContent=v});
  document.querySelectorAll('[data-site-i18n-html]').forEach(el=>{const v=dict[el.dataset.siteI18nHtml];if(v)el.innerHTML=v});
  document.querySelectorAll('[data-contact-email]').forEach(el=>{el.textContent=EMAIL;if(el.tagName==='A')el.href='mailto:'+EMAIL});
}
function patchTools(){const tools=window.RWV2&&Array.isArray(window.RWV2.tools)?window.RWV2.tools:[];for(const tool of tools){if(tool.type==='legacy'){tool.type='direct';tool.src=`./legacy-module.html?idx=${tool.idx}&lang=${encodeURIComponent(lang())}`;tool.legacyDirect=true}if(tool.id==='projects'){tool.type='direct';tool.src='./my-projects-module.html';tool.projectsWrapped=true}}}
function refreshToolLang(){const tools=window.RWV2&&Array.isArray(window.RWV2.tools)?window.RWV2.tools:[];for(const tool of tools){if(tool.legacyDirect)tool.src=`./legacy-module.html?idx=${tool.idx}&lang=${encodeURIComponent(lang())}`}}
function bindSiteActions(){
  document.querySelectorAll('[data-open-tools]').forEach(el=>el.addEventListener('click',()=>window.RWV2&&window.RWV2.openTools()));
  document.querySelectorAll('[data-open-ai]').forEach(el=>el.addEventListener('click',()=>document.getElementById('openAi')?.click()));
  document.querySelectorAll('[data-open-projects]').forEach(el=>el.addEventListener('click',()=>window.RWV2&&window.RWV2.openToolById('projects')));
}
patchTools();render();bindSiteActions();
new MutationObserver(()=>{render();refreshToolLang()}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
window.addEventListener('message',event=>{if(event.data&&event.data.type==='rw:module-error'){const loading=document.getElementById('moduleLoading');const p=loading&&loading.querySelector('p');if(loading)loading.classList.remove('done');if(p)p.textContent=event.data.detail||'Unable to open tool.';}});
})();