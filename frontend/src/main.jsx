import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App.jsx'
import './styles/global.css'

const theme = {
  token: {
    colorPrimary: '#6b7ef5',
    borderRadius: 8,
    colorBgContainer: '#ffffff',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    colorText: '#2e3138',
    colorTextSecondary: '#8c919e',
    colorBorder: '#e8e8ec',
    colorBorderSecondary: '#f0f0f3',
    controlHeight: 34,
    colorSuccess: '#6ecf96',
    colorError: '#f08a8e',
    colorWarning: '#f5b87a',
    colorInfo: '#7ec2f7',
  },
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ConfigProvider locale={zhCN} theme={theme}>
        <App />
      </ConfigProvider>
    </BrowserRouter>
  </StrictMode>,
)
