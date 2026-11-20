'use strict';
const feedCategories = {
  promotion: '优惠活动', pricing: '常规定价与利率', product: '产品与功能',
  branding: '品牌传播', business: '业务发展', research: '研究报告', operations: '运营公告', other: '其他动态'
};
const feedPromotionKinds = {
  welcome:'迎新', referral:'推荐', funding:'入资与留存', spending:'消费回赠', trading:'交易奖励', other:'其他优惠'
};
const feedPromotionHints = {
  welcome:'以新客开户或首次入资为前提的奖励，包括新客专享定存。',
  referral:'以邀请他人、使用推荐码或团队拉新达标为前提的奖励。',
  funding:'以存入、转入或维持资产为前提的优惠；新客及推荐专属活动归入对应类别。',
  spending:'以刷卡或支付消费为前提的折扣、回赠或奖赏。',
  trading:'以证券买卖、外汇兑换等金融交易为前提的奖赏；按参与动作归类，不按奖品归类。',
  other:'已确认属于优惠，但不属于上述参与方式，或参与条件尚未充分披露。'
};
const feedBusinesses = {
  customer:'开户与客户经营', deposit:'存款', card:'卡与支付', invest:'投资与财富',
  fx:'外汇', transfer:'转账与汇款', loan:'贷款与融资', insurance:'保险', institution:'机构经营'
};
function feedCategory(event) {
  const text = (event.kind || '') + ' ' + (event.title || '');
  const explicit = Object.entries(feedCategories).find(([, label]) => event.kind === label);
  if (explicit) return explicit[0];
  // Accept previous labels without losing links or archived source classifications.
  const aliases={'价格与利率':'pricing','品牌宣传':'branding','业务合作':'business','研究发布':'research'};
  if (aliases[event.kind]) return aliases[event.kind];
  if (/研究合作|合作研究/.test(text)) return 'business';
  if (/品牌|赞助|付费内容|嘉年华|周年.*合作|媒体采访/.test(text)) return 'branding';
  if (/研究|调查|展望/.test(text)) return 'research';
  if (/活动|奖赏|奖励|迎新|推荐|回赠|快闪|新客.*(?:开户|定存|入资)|开户.*定存/.test(text)) return 'promotion';
  if (/费用|收费|费率|定价|利率|报价|年费/.test(text)) return 'pricing';
  if (/优惠/.test(text)) return 'promotion';
  if (/人事|委任|行政总裁|中标|安全|维护|虚假|数码化/.test(text)) return 'operations';
  if (/产品|服务|功能|交易|试点|条款|分行|信托/.test(text)) return 'product';
  if (/合作|融资|发债|发行|拓展|对接/.test(text)) return 'business';
  return 'other';
}
function feedPromotionKind(p,event) {
  if (p.category !== 'promotion') return '';
  if (Object.hasOwn(feedPromotionKinds,p.promotion_type)) return p.promotion_type;
  const text=[p.headline,event.title,event.kind,p.summary].filter(Boolean).join(' ');
  // Required participation action determines a single bucket. A referral can
  // reward new clients, and a trading reward can be a deposit coupon.
  if (/推荐|邀请人|受邀人|受荐|达人码|团队.*开户|推荐码/.test(text)) return 'referral';
  if (/迎新|新客|开户.*(?:奖|礼|定存)|手机开户配套/.test(text)) return 'welcome';
  if (/外汇.*(?:兑换|奖)|(?:港股|证券|股票|ETF|期权).*(?:买入|交易|买卖)|交易.*(?:奖|券)/i.test(text)) return 'trading';
  if (/消费|签账|淘宝|刷卡/.test(text)) return 'spending';
  if (/入资|入金|转仓|新资金|定存|定期存款|资产.*(?:维持|留存)|奖赏钱/.test(text)) return 'funding';
  return 'other';
}
function feedBusinessLines(p,event) {
  if (Array.isArray(p.business_lines)) return [...new Set(p.business_lines.filter(k=>Object.hasOwn(feedBusinesses,k)))];
  const text=[p.headline,event.title,...(p.topics || [])].filter(Boolean).join(' ');
  const rules={customer:/开户|迎新|推荐/,deposit:/存款|定存|加息券|存息/,card:/信用卡|提款卡|ZA Card|ULTIMA|消费|签账|支付|ATM|自动柜员/i,
    invest:/投资|证券|股票|港股|美股|期权|ETF|信托|理财|债券|交易订单/i,fx:/外汇|兑换/,
    transfer:/转账|汇款|转数快|拨款/,loan:/贷款|融资|借贷|信贷|ZA Credit|预支薪金/i,insurance:/保险|银保/};
  const keys=Object.entries(rules).filter(([,pattern])=>pattern.test(text)).map(([key])=>key);
  return keys.length?keys:['institution'];
}
function feedPresentation(event, editorial) {
  const parts = String(event.summary || '').split(/(?:^|[；\n])\s*(要点|关键数字|适用条件|期限|核实说明)[：:]/);
  const fields = {};
  for (let i = 1; i < parts.length; i += 2) fields[parts[i]] = parts[i + 1].trim();
  const p = editorial ? {...editorial} : {
    category: feedCategory(event), headline: event.title,
    summary: fields['要点'] || event.summary || '内容摘要待补充。',
    facts: ['关键数字', '适用条件', '期限'].filter(key => fields[key]).map(key => ({label:key, value:fields[key]})),
    evidence_note: fields['核实说明'] || '', topics: []
  };
  if (!Object.hasOwn(feedCategories,p.category)) p.category=feedCategory(event);
  p.promotion_type=feedPromotionKind(p,event);
  p.business_lines=feedBusinessLines(p,event);
  return p;
}
function feedToday() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0,10);
}
function feedStatus(editorial, today = feedToday()) {
  const {start_date:start, end_date:end, effective_date:effective} = editorial;
  if (end && end < today) return ['ended','已结束'];
  if (start && start > today) return ['upcoming','尚未开始'];
  if (effective && effective > today) return ['upcoming','待生效'];
  if (end) {
    const days = Math.round((Date.parse(end) - Date.parse(today)) / 86400000);
    return days <= 7 ? ['ending',days === 0 ? '今日截止' : days + ' 天后截止'] : ['active','期限内'];
  }
  if (effective) return ['effective','已到生效日'];
  return ['unspecified',editorial.category === 'promotion' ? '截止日待确认' : '已收录'];
}
function feedStories(events) {
  const grouped = new Map();
  for (const event of events) {
    const editorial = feedPresentation(event, event.editorial);
    const key = event.institution + '|' + (editorial.story_key || [event.channel,event.url,event.version_key || '',event.title,event.published_at || ''].join('|'));
    if (!grouped.has(key)) grouped.set(key,{institution:event.institution,editorial,sources:[]});
    grouped.get(key).sources.push(event);
  }
  return [...grouped.values()].map(story => {
    story.sources.sort((a,b) => (a.channel === 'official' ? 0 : 1) - (b.channel === 'official' ? 0 : 1));
    const dates = story.sources.map(e=>e.published_at).filter(Boolean).sort();
    story.published = dates[0] || '';
    story.collected = story.sources.map(e=>e.collected || e.observed_at?.slice(0,10) || '').filter(Boolean).sort()[0] || '';
    story.verified = story.sources.map(e=>e.verified_at || e.observed_at || e.collected || '').sort().at(-1)?.slice(0,10) || '';
    story.status = feedStatus(story.editorial);
    return story;
  });
}
