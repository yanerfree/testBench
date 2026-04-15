import { message } from 'antd'

const BASE_URL = '/api/v1'

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

  // 401 → 清除 token 跳转登录
  if (res.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/login'
    return Promise.reject(new Error('未登录或登录已过期'))
  }

  // 403
  if (res.status === 403) {
    message.error('无权限执行此操作')
    return Promise.reject(new Error('无权限'))
  }

  const data = await res.json()

  if (!res.ok) {
    const errMsg = data?.error?.message || `请求失败 (${res.status})`
    message.error(errMsg)
    return Promise.reject(new Error(errMsg))
  }

  return data
}

export const api = {
  get: (url) => request(url),
  post: (url, body) => request(url, { method: 'POST', body }),
  put: (url, body) => request(url, { method: 'PUT', body }),
  del: (url) => request(url, { method: 'DELETE' }),
}
