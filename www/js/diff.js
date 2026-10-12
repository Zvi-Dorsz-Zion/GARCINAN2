/* Word-level diff (LCS) between a witness text and the representative text. */
(function (g) {
  const NIQQUD = /[\u0591-\u05C7]/g;
  const PUNCT = /[.,;:!?()\[\]{}<>"'״׳\-–—־…]/g;
  function norm(w) { return w.replace(NIQQUD, '').replace(PUNCT, ''); }
  function tokens(s) { return (s || '').split(/\s+/).filter(Boolean); }
  function isAbbrev(w) { return /["'״׳]/.test(w); }

  function diffWords(repText, witText) {
    const a = tokens(repText), b = tokens(witText);
    const na = a.map(norm), nb = b.map(norm);
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i][j] = na[i] === nb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const raw = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (na[i] === nb[j]) { raw.push({ t: 'eq', w: b[j] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { raw.push({ t: 'del', w: a[i] }); i++; }
      else { raw.push({ t: 'ins', w: b[j] }); j++; }
    }
    while (i < n) raw.push({ t: 'del', w: a[i++] });
    while (j < m) raw.push({ t: 'ins', w: b[j++] });
    const out = [];
    for (let k = 0; k < raw.length;) {
      if (raw[k].t === 'eq') { out.push(raw[k++]); continue; }
      const dels = [], inss = [];
      while (k < raw.length && raw[k].t !== 'eq') { (raw[k].t === 'del' ? dels : inss).push(raw[k].w); k++; }
      const pair = Math.min(dels.length, inss.length);
      for (let p = 0; p < pair; p++) out.push({ t: 'diff', w: inss[p], was: dels[p] });
      for (let p = pair; p < inss.length; p++) out.push({ t: 'add', w: inss[p] });
      for (let p = pair; p < dels.length; p++) out.push({ t: 'miss', w: dels[p] });
    }
    return out;
  }
  g.TalmudDiff = { diffWords, tokens, norm, isAbbrev };
})(window);
