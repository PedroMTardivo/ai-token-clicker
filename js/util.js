// Formatação de números grandes e de tempo.
(function (AIC) {
  const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

  function fmt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toString();
    const exp = Math.floor(Math.log10(n) / 3);
    if (exp >= SUFFIXES.length) return n.toExponential(2).replace('+', '');
    const v = n / Math.pow(1000, exp);
    return (v < 100 ? v.toFixed(v < 10 ? 2 : 1) : Math.floor(v)) + SUFFIXES[exp];
  }

  function fmtTime(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  }

  AIC.util = { fmt, fmtTime };
})(globalThis.AIC = globalThis.AIC || {});
