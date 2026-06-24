import { message } from 'antd'

const BASE_URL = '/api'

async function request(url, options = {}) {
  const token = localStorage.getItem('token')

  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  }

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body)
  }

  const res = await fetch(`${BASE_URL}${url}`, config)

  // JWT 滑动续期：后端剩余 <2h 时返回新 token
  const newToken = res.headers.get('X-New-Token')
  if (newToken) {
    localStorage.setItem('token', newToken)
  }

  // 401 → 登录页面的请求直接返回错误，不跳转
  if (res.status === 401) {
    const isLoginRequest = url === '/auth/login'
    if (!isLoginRequest) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
      return Promise.reject(new Error('未登录或登录已过期'))
    }
  }

  // 403
  if (res.status === 403) {
    message.error('无权限执行此操作')
    return Promise.reject(new Error('无权限'))
  }

  const data = await res.json()

  if (!res.ok) {
    let errMsg = data?.error?.message
    // Pydantic 422 验证错误: detail 是数组
    if (!errMsg && Array.isArray(data?.detail)) {
      const fieldErrors = data.detail.map(d => {
        const field = d.loc?.[d.loc.length - 1] || ''
        return `${field}: ${d.msg}`
      })
      errMsg = fieldErrors.join('；')
    }
    errMsg = errMsg || `请求失败 (${res.status})`
    message.error(errMsg)
    return Promise.reject(new Error(errMsg))
  }

  return data
}

export const api = {
  get: (url) => request(url),
  post: (url, body) => request(url, { method: 'POST', body }),
  put: (url, body) => request(url, { method: 'PUT', body }),
  patch: (url, body) => request(url, { method: 'PATCH', body }),
  del: (url) => request(url, { method: 'DELETE' }),
  delete: (url) => request(url, { method: 'DELETE' }),
  download: async (url) => {
    const token = localStorage.getItem('token')
    const res = await fetch(`${BASE_URL}${url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`下载失败 (${res.status})`)
    return res.blob()
  },
  /**
   * SSE 流式请求 — 用于 AI 生成接口
   * @param {string} url
   * @param {object} body
   * @param {{ onChunk?: (data: object) => void, onDone?: (data: object) => void, onError?: (msg: string) => void }} callbacks
   * @returns {{ abort: () => void }}
   */
  stream: (url, body, { onChunk, onDone, onError } = {}) => {
    const token = localStorage.getItem('token')
    const controller = new AbortController()

    ;(async () => {
      try {
        const res = await fetch(`${BASE_URL}${url}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!res.ok) {
          const text = await res.text()
          onError?.(text || `请求失败 (${res.status})`)
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n\n')
          buffer = lines.pop()

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data: ')) continue
            const payload = trimmed.slice(6)
            if (payload === '[DONE]') { onDone?.({}); return }
            try {
              const data = JSON.parse(payload)
              if (data.type === 'error') {
                onError?.(data.message || '生成失败')
                return
              }
              if (data.type === 'done') {
                onDone?.(data)
              } else {
                onChunk?.(data)
              }
            } catch { /* skip unparseable chunks */ }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          onError?.(err.message || '网络错误')
        }
      }
    })()

    return { abort: () => controller.abort() }
  },
}
