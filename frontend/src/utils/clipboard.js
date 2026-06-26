/**
 * 复制文本到剪贴板 — 兼容 HTTP 环境
 * navigator.clipboard 在非 HTTPS 下会被浏览器拒绝，
 * fallback 到 document.execCommand('copy')
 */
export function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
  return Promise.resolve()
}
