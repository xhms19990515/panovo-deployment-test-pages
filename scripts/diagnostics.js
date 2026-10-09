const runButton = document.querySelector('#run');
const downloadButton = document.querySelector('#download');
const resultsBody = document.querySelector('#results');
const statusElement = document.querySelector('#status');
let report = null;

async function fetchCheck(name, path, expectedType, range = false) {
  const started = performance.now();
  try {
    const response = await fetch(`${path}?probe=${Date.now()}`, {
      cache: 'no-store',
      headers: range ? { Range: 'bytes=0-1023' } : undefined,
    });
    const body = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || '未返回';
    const statusOkay = range ? [200, 206].includes(response.status) : response.ok;
    return {
      name,
      ok: statusOkay && contentType.includes(expectedType) && body.byteLength > 0,
      ms: Math.round(performance.now() - started),
      detail: `HTTP ${response.status}; ${contentType}; ${body.byteLength} bytes${range ? `; Accept-Ranges: ${response.headers.get('accept-ranges') || '未返回'}` : ''}`,
    };
  } catch (error) {
    return { name, ok: false, ms: Math.round(performance.now() - started), detail: error instanceof Error ? error.message : String(error) };
  }
}

async function imageDecodeCheck(name, path) {
  const started = performance.now();
  try {
    const response = await fetch(`${path}?decode=${Date.now()}`, { cache: 'no-store' });
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const detail = `${bitmap.width}×${bitmap.height}; ${blob.type}; ${blob.size} bytes`;
    const ok = bitmap.width === 960 && bitmap.height === 600;
    bitmap.close();
    return { name, ok, ms: Math.round(performance.now() - started), detail };
  } catch (error) {
    return { name, ok: false, ms: Math.round(performance.now() - started), detail: error instanceof Error ? error.message : String(error) };
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

runButton.addEventListener('click', async () => {
  runButton.disabled = true;
  downloadButton.disabled = true;
  statusElement.textContent = '检测进行中…';
  resultsBody.innerHTML = '<tr><td colspan="4">正在请求本站资源…</td></tr>';
  const checks = await Promise.all([
    fetchCheck('HTTPS 与健康文件', '/panovo-deployment-test-pages/health.json', 'application/json'),
    fetchCheck('测试页面', '/panovo-deployment-test-pages/test', 'text/html'),
    imageDecodeCheck('WebP 下载与解码', '/panovo-deployment-test-pages/media/panovo.webp'),
    imageDecodeCheck('AVIF 下载与解码', '/panovo-deployment-test-pages/media/panovo.avif'),
    fetchCheck('MP4 分段请求', '/panovo-deployment-test-pages/media/panovo.mp4', 'video/mp4', true),
  ]);
  resultsBody.innerHTML = checks.map((check) => `<tr><td>${escapeHtml(check.name)}</td><td class="${check.ok ? 'pass' : 'fail'}">${check.ok ? '通过' : '失败'}</td><td>${check.ms} ms</td><td>${escapeHtml(check.detail)}</td></tr>`).join('');
  statusElement.textContent = `自动检测完成：${checks.filter((check) => check.ok).length}/${checks.length} 项通过。请继续人工播放视频。`;
  report = {
    schema: 'panovo-connectivity-report/v1',
    generatedAt: new Date().toISOString(),
    page: location.href,
    secureContext: window.isSecureContext,
    context: {
      carrier: document.querySelector('#carrier').value,
      network: document.querySelector('#network').value,
      region: document.querySelector('#region').value.trim(),
      proxy: document.querySelector('#proxy').value,
      playback: document.querySelector('#playback').value,
    },
    browser: { userAgent: navigator.userAgent, language: navigator.language, platform: navigator.platform },
    checks,
    limitation: 'This report represents one device, one network, and one test time. It does not prove nationwide availability.',
  };
  downloadButton.disabled = false;
  runButton.disabled = false;
});

downloadButton.addEventListener('click', () => {
  if (!report) return;
  report.context.playback = document.querySelector('#playback').value;
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `panovo-network-test-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});
