// =================================================================
//          CLASIFICADOR DE TIPO DE CARRERA MEJORADO
// =================================================================

window.classifyRun = function classifyRun(act = {}, streams = {}) {
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const sum = arr => arr.reduce((s, x) => s + (x || 0), 0);

    function paceMinPerKmFromSpeed(mps) { return mps && mps > 0 ? 1000/mps/60 : 0; }
    function calculateCV(arr) {
        if (!Array.isArray(arr) || arr.length < 2) return 0;
        const n = arr.map(Number).filter(x => isFinite(x) && x>0);
        if(n.length<2) return 0;
        const m = n.reduce((a,b)=>a+b,0)/n.length;
        const sd = Math.sqrt(n.map(x=>Math.pow(x-m,2)).reduce((a,b)=>a+b,0)/n.length);
        return (sd/m)*100;
    }
    function normalizeEffort(e){ return clamp(Number(e)||0,0,300)/300; }

    function emptyScores() {
        return { 'Recovery Run':0,'Easy Run':0,'Long Run':0,'Race':0,
                 'Tempo Run':0,'Intervals':0,'Fartlek':0,'Progressive Run':0,
                 'Hill Repeats':0,'Trail Run':0 };
    }
    function addScores(target, addObj, weight=1){
        for(const k in addObj) target[k] = (target[k]||0) + (addObj[k]||0)*weight;
    }

    // ---------- Extract metrics ----------
    const distKm = (act.distance||0)/1000;
    const movingTime = act.moving_time||0;
    const elapsedTime = act.elapsed_time||movingTime||1;
    const moveRatio = clamp(movingTime/elapsedTime,0,1);
    const elevationPerKm = distKm>0?(act.total_elevation_gain||0)/distKm:0;
    const paceAvgMinKm = paceMinPerKmFromSpeed(act.average_speed);
    const hrAvg = act.average_heartrate||0;
    const effortNorm = normalizeEffort(act.suffer_score||act.perceived_effort||0);

    let paceStream = [];
    try {
        if(streams?.distance?.data && streams?.time?.data){
            const len = Math.min(streams.distance.data.length, streams.time.data.length);
            for(let i=1;i<len;i++){
                const dDist = streams.distance.data[i]-streams.distance.data[i-1];
                const dTime = streams.time.data[i]-streams.time.data[i-1];
                if(dDist>0 && dTime>0) paceStream.push((dTime/dDist)*1000/60);
            }
        } else if(streams?.pace?.data) paceStream = streams.pace.data.map(Number).filter(x=>isFinite(x)&&x>0);
    } catch{}

    const paceCV = calculateCV(paceStream);
    const hrCV = Number(String(act.hr_variability_stream||act.hr_variability_laps||'').replace('%',''))||0;

    // ---------- HR zones ----------
    let pctZ = { low:0, tempo:0, high:0 };
    try {
        const zonesObj = JSON.parse(localStorage?.getItem?.('strava_training_zones')||'{}')?.heart_rate?.zones||null;
        if(zonesObj && streams?.heartrate?.data && streams?.time?.data){
            const tPerZone = zonesObj.map(()=>0);
            const hr = streams.heartrate.data, times = streams.time.data;
            for(let i=1;i<Math.min(hr.length,times.length);i++){
                const dt = times[i]-times[i-1]; if(!(dt>0)) continue;
                const zoneIdx = zonesObj.findIndex((z,i)=>hr[i]>=(i===0?0:(zonesObj[i-1].max+1)) && hr[i]<=z.max);
                tPerZone[zoneIdx>=0?zoneIdx:tPerZone.length-1] += dt;
            }
            const total = sum(tPerZone)||1;
            pctZ.low = (tPerZone[0]+(tPerZone[1]||0))/total*100;
            pctZ.tempo = (tPerZone[2]||0)/total*100;
            pctZ.high = ((tPerZone[3]||0)+(tPerZone[4]||0))/total*100;
        }
    } catch{}

    // ---------- Negative split ----------
    let negativeSplitRatio = 1;
    try{
        if(streams?.distance?.data && streams?.time?.data){
            const halfway = (act.distance||0)/2;
            const idx = streams.distance.data.findIndex(d=>d>=halfway);
            if(idx>0){
                const tHalf = streams.time.data[idx];
                const secondHalf = movingTime - tHalf;
                negativeSplitRatio = tHalf>0 ? secondHalf/tHalf : 1;
            }
        }
    } catch{}

    // ---------- Scoring ----------
    const scores = emptyScores();

    // Sport type & name hints
    if(act.sport_type==='TrailRun') addScores(scores, {'Trail Run':400});
    if(act.name && /tempo/i.test(act.name)) addScores(scores, {'Tempo Run':60});
    if(act.name && /fartlek/i.test(act.name)) addScores(scores, {'Fartlek':80});

    // Distance (smooth influence)
    if(distKm>=15) addScores(scores,{'Long Run':100+distKm*2});
    else if(distKm>=5) addScores(scores,{'Easy Run':30, 'Tempo Run':distKm>6?10:0});
    else addScores(scores,{'Recovery Run':50, 'Easy Run':20});

    // Elevation
    if(elevationPerKm>20) addScores(scores,{'Hill Repeats':100,'Trail Run':50});

    // Moving ratio
    if(moveRatio<0.6) addScores(scores,{'Trail Run':30,'Fartlek':20, 'Intervals':10});

    // Effort
    if(effortNorm>0.7) addScores(scores,{'Race':80,'Intervals':50});
    else if(effortNorm>0.45) addScores(scores,{'Tempo Run':50,'Fartlek':30,'Long Run':20});
    else addScores(scores,{'Recovery Run':60,'Easy Run':30});

    // HR zones
    if(pctZ.low>90) addScores(scores,{'Recovery Run':120,'Easy Run':40});
    if(pctZ.tempo>50) addScores(scores,{'Tempo Run':100});
    if(pctZ.high>40) addScores(scores,{'Intervals':90});
    if(pctZ.high>60) addScores(scores,{'Race':120});

    // Pace variability
    if(paceCV>20) addScores(scores,{'Intervals':80,'Fartlek':60});
    else if(paceCV>12) addScores(scores,{'Fartlek':40,'Progressive Run':30});
    else if(paceCV<6) addScores(scores,{'Race':20,'Tempo Run':10});

    // Negative split
    if(distKm>=8 && negativeSplitRatio<0.95) addScores(scores,{'Progressive Run':80});
    else if(distKm>=8 && negativeSplitRatio<1) addScores(scores,{'Progressive Run':30});

    // ---------- Output ----------
    const totalScore = sum(Object.values(scores))||1;
    const results = Object.entries(scores).map(([type,sc])=>({ type, abs:Math.round(sc), pct:+((sc/totalScore)*100).toFixed(1)}))
        .filter(r=>r.abs>0).sort((a,b)=>b.abs-a.abs);

    return {
        top: results.slice(0,5),
        all: results,
        diagnostics:{distKm, paceAvgMinKm:+paceAvgMinKm.toFixed(2), paceCV:+paceCV.toFixed(1), hrAvg, hrCV:+hrCV.toFixed(1), effortNorm:+effortNorm.toFixed(2), elevationPerKm:+elevationPerKm.toFixed(1), moveRatio:+moveRatio.toFixed(2), pctZ, negativeSplitRatio:+negativeSplitRatio.toFixed(2)}
    };
}
