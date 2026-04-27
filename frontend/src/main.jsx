import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App.jsx'
import './styles/global.css'

const theme = {
  token: {
    colorPrimary: '#00b96b',
    borderRadius: 6,
    colorBgContainer: '#ffffff',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    colorText: '#1d2129',
    colorTextSecondary: '#86909c',
    colorBorder: '#e5e6eb',
    colorBorderSecondary: '#f2f3f5',
    controlHeight: 32,
    colorSuccess: '#00b96b',
    colorError: '#f53f3f',
    colorWarning: '#ff7d00',
    colorInfo: '#3370ff',
  },
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ConfigProvider locale={zhCN} theme={theme}>
      <App />
    </ConfigProvider>
  </BrowserRouter>,
)
