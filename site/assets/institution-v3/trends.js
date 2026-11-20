(() => {
  'use strict';

  // Institution colors in the Xiaohongshu weekly report. MoonFox uses its own App names.
  const reportColors = new Map([
    ['众安银行','#32CB9D'], ['汇丰银行','#84CADB'], ['中银香港','#292D4D'],
    ['蚂蚁银行','#FCDE35'], ['大象银行','#EE8F94'], ['嘉信','#9CA8C0'],
    ['恒生银行','#E4C47E'], ['富途','#BBD1BC'], ['盈立','#A6A7B4'],
    ['老虎','#596381'], ['致富','#C8A65D'], ['长桥','#5AA8B9']
  ]);
  const appBrands = new Map([
    ['ZA Bank','众安银行'], ['HSBC Mobile Banking','汇丰银行'],
    ['BOCHK Zhong Yin Xiang Gang','中银香港'], ['Schwab Mobile','嘉信'],
    ['大象银行 EleBank（原天星银行）','大象银行']
  ]);
  const exact = new Intl.NumberFormat('zh-HK', {maximumFractionDigits: 12});
  const compact = new Intl.NumberFormat('zh-HK', {notation:'compact', maximumFractionDigits:1});
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[c]);
  const toDay = date => Date.parse(date.slice(0,10) + 'T00:00:00Z') / 86400000;

  function timeline(dates) {
    const sample = dates[0] || '';
    let grain = 'day', positions;
    if (/^\d{4}-Q[1-4]$/.test(sample)) {
      grain = 'quarter';
      positions = dates.map(d => Number(d.slice(0,4))*4 + Number(d.slice(-1)));
    } else if (/^\d{4}-\d{2}$/.test(sample)) {
      grain = 'month';
      positions = dates.map(d => Number(d.slice(0,4))*12 + Number(d.slice(5,7)));
    } else if (/^\d{4}-\d{2}-\d{2}/.test(sample)) {
      positions = dates.map(toDay);
      const steps = positions.slice(1).map((v,i) => v-positions[i]).sort((a,b) => a-b);
      if (sample.includes('~') || steps[Math.floor(steps.length/2)] === 7) {
        grain = 'week';
        positions = positions.map(d => d/7);
      }
    } else positions = dates.map((_,i) => i);
    return {grain, positions};
  }

  const periodOptions = {
    day: [[7,'7 天'],[30,'30 天'],[90,'90 天']],
    week: [[4,'4 周'],[13,'13 周'],[26,'26 周']],
    month: [[3,'3 个月'],[6,'6 个月'],[12,'12 个月']],
    quarter: [[2,'2 季'],[4,'4 季'],[8,'8 季']]
  };
  const defaultPeriods = {day:30, week:13, month:12, quarter:4};

  function marketTrendHTML(model) {
    if (!model?.dates?.length || !model.series?.length) return '';
    return '<section class="market-trend" aria-label="指标趋势">'+
      '<div class="mt-header"><div><h3>指标趋势</h3><p class="mt-span"></p></div><div class="mt-ranges" role="group" aria-label="图表时间范围"></div></div>'+
      '<div class="mt-axis-unit"></div><div class="mt-plot-row"><div class="mt-y" aria-hidden="true"></div><div class="mt-plot" tabindex="0" role="slider" aria-label="选择日期查看数值" aria-valuemin="1" aria-orientation="horizontal">'+
      '<svg viewBox="0 0 1000 240" preserveAspectRatio="none" aria-hidden="true"></svg><span class="mt-date" aria-hidden="true"></span>'+
      '</div></div><div class="mt-x" aria-hidden="true"></div><div class="mt-summary"><time></time><small>点选图例可显示或隐藏曲线</small></div>'+
      '<div class="mt-legend" role="group" aria-label="机构及所选日期数值"></div></section>';
  }

  function mountMarketTrend(root, model) {
    const host = root?.matches?.('.market-trend') ? root : root?.querySelector('.market-trend');
    if (!host || !model?.dates?.length || !model.series?.length) return;
    const {dates, series, unit=''} = model;
    const {grain, positions} = timeline(dates);
    const last = dates.length-1, span = positions[last]-positions[0]+1;
    const choices = periodOptions[grain].filter(([n]) => n<span);
    choices.push([Infinity,'全部']);
    let period = choices.some(([n]) => n===defaultPeriods[grain]) ? defaultPeriods[grain] : Infinity;
    if(model.customRange)period=Infinity;
    let first=0, selected=last;
    let scale=1;
    const visible = new Set(series.map((_,i) => i));
    const plot = host.querySelector('.mt-plot'), svg = plot.querySelector('svg');
    const ranges = host.querySelector('.mt-ranges'), legend = host.querySelector('.mt-legend');
    const color = i => series[i].color || reportColors.get(appBrands.get(series[i].label) || series[i].label) || '#676A81';
    const dot = (cls,x,y,ink) => '<circle class="'+cls+'" cx="'+x+'" cy="'+y+'" r="3.3" fill="'+ink+'" vector-effect="non-scaling-stroke"/>';
    const x = i => last===first ? 500 : (positions[i]-positions[first])/(positions[last]-positions[first])*1000;
    const y = v => 235-v/scale*230;
    const shortDate = d => grain==='week' ? d.split('~')[0].slice(5) : grain==='day' ? d.slice(5) : d;

    ranges.innerHTML = choices.map(([n,label])=>'<button type="button" data-period="'+n+'">'+label+'</button>').join('');
    legend.innerHTML = series.map((s,i)=>
      '<button type="button" data-series="'+i+'" style="--mt-series:'+color(i)+'"><i aria-hidden="true"></i>'+
      '<span>'+escape(s.label)+'</span><strong></strong></button>').join('');
    host.querySelector('.mt-axis-unit').textContent=unit;
    function focusDate(i) {
      selected = Math.max(first,Math.min(last,i));
      const fraction = x(selected)/10;
      const badge = plot.querySelector('.mt-date');
      badge.style.left = fraction+'%';
      badge.style.transform = fraction<=15 ? 'none' : fraction>=85 ? 'translateX(-100%)' : 'translateX(-50%)';
      badge.textContent = shortDate(dates[selected]);
      host.querySelector('.mt-summary time').textContent = dates[selected];
      plot.setAttribute('aria-valuenow',String(selected-first+1));
      const details=[];
      series.forEach((s,j)=>{
        const v=s.values[selected], value=Number.isFinite(v)?exact.format(v):'—';
        legend.children[j].querySelector('strong').textContent=value;
        legend.children[j].setAttribute('aria-label',s.label+'，'+value+(Number.isFinite(v)&&unit?' '+unit:''));
        if(visible.has(j)) details.push(s.label+' '+value);
      });
      plot.setAttribute('aria-valuetext',dates[selected]+'，'+details.join('，'));
      svg.querySelector('.mt-markers').innerHTML=series.map((s,j)=>{
        const value=s.values[selected];
        return visible.has(j) && Number.isFinite(value) ? dot('mt-point',x(selected),y(value),color(j)) : '';
      }).join('');
    }

    function draw() {
      first=positions.findIndex(t=>t>positions[last]-period);
      if(first<0)first=last;
      const grid=[],ticks=[];
      let max=0;
      for(const j of visible)for(let i=first;i<=last;i++){
        const value=series[j].values[i];
        if(Number.isFinite(value))max=Math.max(max,value);
      }
      const rawStep=(max||4)/4,power=10**Math.floor(Math.log10(rawStep));
      const step=([1,2,2.5,5,10].find(n=>n>=rawStep/power)||10)*power;
      scale=4*step;
      for(let k=0;k<=4;k++){
        const value=k*step,yy=235-k*57.5;
        ticks.push('<span style="top:'+yy/2.4+'%">'+escape(value>=10000?compact.format(value):exact.format(value))+'</span>');
        grid.push('<line x1="0" x2="1000" y1="'+yy+'" y2="'+yy+'" class="mt-grid"/>');
      }
      host.querySelector('.mt-y').innerHTML=ticks.join('');
      const paths=[];
      for(const j of visible){
        const data=series[j].values;
        let path='',run=0;
        const endRun = end => {
          if(run===1) paths.push(dot('mt-single',x(end),y(data[end]),color(j)));
          run=0;
        };
        for(let i=first;i<=last;i++){
          if(!Number.isFinite(data[i]) || (i>first && positions[i]-positions[i-1]>1.01))endRun(i-1);
          if(!Number.isFinite(data[i]))continue;
          path+=(run ? 'L' : 'M')+x(i).toFixed(2)+' '+y(data[i]).toFixed(2)+' ';
          run++;
        }
        endRun(last);
        paths.push('<path class="mt-line" d="'+path+'" stroke="'+color(j)+'" />');
      }
      svg.innerHTML=grid.join('')+paths.join('')+'<g class="mt-markers"></g>';
      host.querySelector('.mt-span').textContent=dates[first]+' — '+dates[last];
      plot.setAttribute('aria-valuemax',String(last-first+1));
      const ticksX=[first,Math.round((first+last)/2),last].filter((v,i,a)=>a.indexOf(v)===i);
      host.querySelector('.mt-x').innerHTML=ticksX.map(index=>'<span style="left:'+x(index)/10+'%;transform:translateX('+
        (index===first&&first!==last?'0':index===last&&first!==last?'-100%':'-50%')+')">'+escape(shortDate(dates[index]))+'</span>').join('');
      for(const b of ranges.children)b.setAttribute('aria-pressed',String(Number(b.dataset.period)===period));
      for(const b of legend.children){
        const active=visible.has(Number(b.dataset.series));
        b.setAttribute('aria-pressed',String(active));
        b.setAttribute('aria-disabled',String(active && visible.size===1));
      }
      focusDate(selected);
    }

    function pointer(event){
      const bounds=plot.getBoundingClientRect();
      if(!bounds.width || last===first)return;
      const ratio=Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width));
      const position=positions[first]+ratio*(positions[last]-positions[first]);
      let low=first,high=last;
      while(low<high){const mid=Math.floor((low+high)/2); if(positions[mid]<position)low=mid+1;else high=mid;}
      const i=low>first&&position-positions[low-1]<positions[low]-position?low-1:low;
      if(i!==selected)focusDate(i);
    }
    ranges.onclick = event => {
      const button=event.target.closest('button[data-period]');
      if(button){period=Number(button.dataset.period);draw();}
    };
    legend.onclick = event => {
      const button=event.target.closest('button[data-series]');
      if(!button || button.getAttribute('aria-disabled')==='true')return;
      const j=Number(button.dataset.series);
      if(visible.has(j))visible.delete(j);else visible.add(j);
      draw();
    };
    plot.onpointermove=pointer;
    plot.onpointerdown=pointer;
    plot.onkeydown=event=>{
      const jump={ArrowLeft:selected-1,ArrowRight:selected+1,Home:first,End:last};
      if(Object.hasOwn(jump,event.key)){event.preventDefault();focusDate(jump[event.key]);}
    };
    draw();
  }
  window.marketTrendHTML=marketTrendHTML;
  window.mountMarketTrend=mountMarketTrend;
})();
