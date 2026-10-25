/* ПРОТОТИП — фиктивни данни, споделени от всички варианти в dashboard-styles/. Не е продукционен код. */
const P = {
  D:{n:'Дако',i:'Д',c:'#4fa3ff'},
  S:{n:'Съпруга',i:'С',c:'#ff9a5c'},
  F:{n:'Семейство',i:'✦',c:'#c58dff'},
};
const TODAY = new Date(2026,9,25); // неделя
const DOW = ['нд','пн','вт','ср','чт','пт','сб'];
const DOWL = ['неделя','понеделник','вторник','сряда','четвъртък','петък','събота'];
const MON = ['яну','фев','мар','апр','май','юни','юли','авг','сеп','окт','ное','дек'];
const addD=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const CAL = [
  {o:0, ev:[{t:'11:00',n:'Обяд при баба',w:'F'},{t:'17:30',n:'Фитнес',w:'D'},{t:'19:00',n:'Кино с Ива',w:'S'}]},
  {o:1, ev:[{t:'09:00',n:'Зъболекар',w:'D'},{t:'18:00',n:'Йога',w:'S'}]},
  {o:2, ev:[{t:'08:30',n:'Есенен празник в градината',w:'F'},{t:'20:00',n:'Среща с Петър',w:'D'}]},
  {o:3, ev:[{t:'12:00',n:'Обяд с колеги',w:'S'}]},
];
const BUDGET = {limit:3200, spent:2140, day:25, days:31};
BUDGET.rem = BUDGET.limit-BUDGET.spent;
BUDGET.pace = Math.round(BUDGET.rem/(BUDGET.days-BUDGET.day+1));
const MENU = [
  {d:'нд',l:'Леща яхния',dn:'Пиле с ориз и зеленчуци',cook:'D',v:{D:1,S:1}},
  {d:'пн',l:'Пиле с ориз (остатък)',dn:'Мусака',cook:'S',v:{D:1,S:1}},
  {d:'вт',l:'Салата с риба тон',dn:'Спагети болонезе',cook:'D',v:{D:1,S:0}},
  {d:'ср',l:'Мусака (остатък)',dn:'Печена сьомга с картофи',cook:'S',v:{D:-1,S:1}},
  {d:'чт',l:'Боб чорба',dn:'Пълнени чушки',cook:'D',v:{D:0,S:0}},
  {d:'пт',l:'Чушки (остатък)',dn:'Пица домашна',cook:'F',v:{D:1,S:1}},
  {d:'сб',l:'Таратор + баница',dn:'Скара на терасата',cook:'D',v:{D:0,S:0}},
];
const SHOP = [
  {n:'Пилешко филе',q:'1,2 кг',a:'Месо',promo:'Lidl −30%'},
  {n:'Ориз басмати',q:'1 кг',a:'Сухи',promo:'Kaufland 2+1'},
  {n:'Кайма смес',q:'800 г',a:'Месо',promo:'Метро −20%'},
  {n:'Патладжан',q:'3 бр',a:'Зеленчуци'},
  {n:'Картофи',q:'2 кг',a:'Зеленчуци',ck:true},
  {n:'Кисело мляко',q:'4 бр',a:'Млечни',ck:true},
  {n:'Сьомга филе',q:'600 г',a:'Риба'},
  {n:'Зехтин',q:'1 л',a:'Сухи',promo:'Billa −25%'},
  {n:'Сирене',q:'400 г',a:'Млечни'},
  {n:'Домати',q:'1 кг',a:'Зеленчуци',ck:true},
];
const TASKS = [
  {n:'Плати тока',w:'D',due:'днес'},
  {n:'Запиши колата за преглед',w:'D',due:'вт'},
  {n:'Подарък за Мира',w:'S',due:'ср',ck:true},
  {n:'Смени филтъра на водата',w:'D',due:'сб'},
  {n:'Резервирай зъболекар за Ева',w:'S',due:'пт'},
  {n:'Прибери зимните гуми',w:'F',due:'нд'},
];
const WEIGHT = {goal:85, pts:[94.2,93.8,93.9,93.1,92.6,92.8,92.1,91.7]};
const WORK = [
  {n:'Гребане с ластик',s:'3×15',ck:true},
  {n:'Клек с гира',s:'4×10',ck:true},
  {n:'Лицеви опори',s:'3×12'},
  {n:'Планк',s:'3×45 с'},
];
const PROMO = [
  {s:'Lidl',n:'Пилешко филе',p:'−30%',until:'до нд'},
  {s:'Kaufland',n:'Ориз басмати',p:'2+1',until:'до чт'},
  {s:'Billa',n:'Зехтин 1 л',p:'−25%',until:'до сб'},
  {s:'Метро',n:'Кайма смес',p:'−20%',until:'до пт'},
];
const RECIPES = {total:42, fresh:3};
const SYNC = {cal:'преди 4 мин', wallet:'преди 2 ч', promo:'преди 6 ч'};

/* ---------------- ПОМОЩНИ ---------------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=n=>n.toLocaleString('bg-BG');
const pct=Math.min(100,Math.round(BUDGET.spent/BUDGET.limit*100));
const dayPct=Math.round(BUDGET.day/BUDGET.days*100);
const over=BUDGET.spent>BUDGET.limit;
function clockStr(){const d=new Date();return d.toLocaleTimeString('bg-BG',{hour:'2-digit',minute:'2-digit'})}
/* in-memory състояние за отметки/гласове/задачи; живее само в страницата */
const STATE = { shop: SHOP.map(x=>!!x.ck), tasks: TASKS.map(x=>!!x.ck), work: WORK.map(x=>!!x.ck), votes: MENU.map(m=>({...m.v})) };
/* съобщава на родителската рамка (index.html) заглавието и клавишите ← → */
addEventListener('keydown',e=>{ if(e.key==='ArrowLeft'||e.key==='ArrowRight') parent.postMessage({proto:'nav',dir:e.key==='ArrowLeft'?-1:1},'*'); });
