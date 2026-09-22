/** Historical standalone HTML. The sidecar must not rewrite this string. */

export const HISTORICAL_STANDALONE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>历史经营简报</title></head>
<body>
  <main>
    <h1>历史经营简报</h1>
    <section>
      <p id="lead">本周到店人数保持稳定。</p>
      <button type="button">查看明细</button>
      <table><tbody><tr><td>渠道</td><td id="region">华东</td></tr></tbody></table>
    </section>
    <script type="text/plain">historical-noop</script>
    <iframe srcdoc="&lt;p&gt;嵌入预览&lt;/p&gt;" title="嵌入"></iframe>
    <canvas width="10" height="10"></canvas>
    <form><input name="q" value=""></form>
    <p id="bound" data-binding="metric.gsv">12400</p>
    <img alt="图表" id="chart">
  </main>
</body>
</html>
`;
