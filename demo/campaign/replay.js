// Public deterministic replay. No agent adapters, models, credentials or external writes.
export const DEFAULT_BRIEF = 'Create a launch campaign for a new 5G offer. Compare options, check the offer, and bring the campaign back for approval.';
export const offers = {
  VALUE: { name:'5G Everyday', data:50, price:14, cost:8, headline:'More life. Less limits.', accent:'#36e0ad' },
  MATCH: { name:'5G Momentum', data:100, price:20, cost:11, headline:'Find your next gear.', accent:'#8cbeff' },
  PREMIUM: { name:'5G Beyond', data:200, price:29, cost:16, headline:'Go beyond the ordinary.', accent:'#ff9d74' },
};
export const tasks = [
 {id:'ATL-101', owner:'Catalogue Agent', key:'catalogue', title:'Coordinate the campaign', start:1, done:9},
 {id:'ATL-102', owner:'Competitor Supervisor', key:'competitor-supervisor', title:'Compare three positions', start:1, done:3},
 {id:'ATL-103', owner:'Product Configurator (B2C)', key:'product-configurator', title:'Prepare the offer draft', start:3, done:4},
 {id:'ATL-104', owner:'Pricing and Monetisation Strategist', key:'pricing-strategist', title:'Check price and contribution', start:4, done:5},
 {id:'ATL-105', owner:'Catalog Governor', key:'catalog-governor', title:'Review offer facts', start:5, done:6},
 {id:'ATL-106', owner:'Marketing', key:'marketing-agent', title:'Prepare the launch copy', start:6, done:7},
 {id:'ATL-107', owner:'Campaign Designer', key:'campaign-designer', title:'Build three campaign formats', start:7, done:8},
];
export const phases = ['One brief. A team of agents.','The team takes ownership.','Choose the market position.','An offer becomes a draft.','The numbers are visible.','Every claim gets reviewed.','The story takes shape.','Three formats. One offer.','Ready for your review.','Campaign package approved.'];
export function initialState() { return {stage:0, brief:'', choice:null, selected:'ATL-101', playing:false}; }
export function transition(s, action) {
  if (action.type === 'reset') return initialState();
  if (action.type === 'inspect') return tasks.some(t=>t.id===action.id) ? {...s, selected:action.id} : s;
  if (action.type === 'start' && s.stage === 0 && action.brief?.trim()) return {...s, brief:action.brief.trim().slice(0,2000),stage:1};
  if (action.type === 'choose' && s.stage === 2 && offers[action.choice]) return {...s,choice:action.choice,stage:3,selected:'ATL-103',playing:false};
  if (action.type === 'approve' && s.stage === 8) return {...s,stage:9,selected:'ATL-101',playing:false};
  if (action.type === 'play') return {...s,playing:s.stage>0 && s.stage<8 && s.stage!==2 ? !s.playing : false};
  if (action.type === 'step' && s.stage>0 && s.stage<8 && s.stage!==2) {
    const stage=s.stage+1;
    return {...s,stage,selected:({2:'ATL-102',4:'ATL-104',5:'ATL-105',6:'ATL-106',7:'ATL-107',8:'ATL-101'})[stage],playing:stage===2||stage===8?false:s.playing};
  }
  return s;
}
export function taskStatus(task,s) {return s.stage>=task.done?'Done':s.stage<task.start?'Queued':task.id==='ATL-101'&&s.stage===8?'Review':task.id==='ATL-102'&&s.stage===2?'Your choice':'In progress';}
export function pricing(choice) {const o=offers[choice]; if(!o) return null; return {revenue:o.price*1000,cost:o.cost*1000,contribution:(o.price-o.cost)*1000,margin:Math.round((o.price-o.cost)/o.price*100)};}
export function campaignSVG(choice,format='square') {
 const o=offers[choice]; if(!o) throw new Error('Choose an offer first');
 const [w,h]=({square:[1080,1080],story:[1080,1920],banner:[1600,900]})[format]??[1080,1080];
 const banner=format==='banner', story=format==='story', x=82, y=story?650:banner?280:350;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><radialGradient id="glow"><stop stop-color="${o.accent}" stop-opacity=".45"/><stop offset="1" stop-color="#111" stop-opacity="0"/></radialGradient></defs><rect width="${w}" height="${h}" fill="#111"/><circle cx="${w*.82}" cy="${h*.45}" r="${w*.58}" fill="url(#glow)"/><g fill="none" stroke="${o.accent}" opacity=".3">${[220,280,340,400].map(r=>`<circle cx="${w*.85}" cy="${h*.4}" r="${r}"/>`).join('')}</g><text x="${x}" y="115" fill="#fafafa" font-family="Arial,sans-serif" font-size="40" letter-spacing="12">ATLAS</text><text x="${x}" y="165" fill="${o.accent}" font-family="Arial,sans-serif" font-size="19" letter-spacing="6">${o.name.toUpperCase()} / ${choice}</text><text x="${x}" y="${y}" fill="#fafafa" font-family="Arial,sans-serif" font-size="${banner?72:68}" font-weight="700">${o.headline.split('. ').map((v,i)=>`<tspan x="${x}" dy="${i?85:0}">${v}${i===0&&o.headline.includes('. ')?'.':''}</tspan>`).join('')}</text><text x="${x}" y="${y+220}" fill="${o.accent}" font-family="Arial,sans-serif" font-weight="700" font-size="116">${o.data} GB</text><text x="${x}" y="${y+285}" fill="#ddd" font-family="Arial,sans-serif" font-size="32">5G data · €${o.price} / month</text><rect x="${x}" y="${h-230}" width="390" height="72" rx="36" fill="${o.accent}"/><text x="${x+42}" y="${h-183}" fill="#111" font-family="Arial,sans-serif" font-size="27" font-weight="700">Explore the possibilities →</text><text x="${x}" y="${h-96}" fill="#b5b5b5" font-family="Arial,sans-serif" font-size="20">Synthetic offer · Subject to 5G coverage · No live sale</text><text x="${x}" y="${h-60}" fill="#777" font-family="Arial,sans-serif" font-size="16">ATLAS DEMONSTRATION / CAMPAIGN DESIGNER / GENERATED SVG</text></svg>`;
}
