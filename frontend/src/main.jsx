import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import App from './App.jsx'
import { LangProvider, useLang } from './utils/i18n.jsx'
import './styles/global.css'

const theme = {
  token: {
    colorPrimary: '#36b37e',
    borderRadius: 12,
    borderRadiusLG: 16,
    borderRadiusSM: 8,
    colorBgContainer: 'rgba(255,255,255,0.35)',
    fontFamily: "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif",
    colorText: '#1d2129',
    colorTextSecondary: '#86909c',
    colorBorder: 'rgba(0,0,0,0.06)',
    colorBorderSecondary: 'rgba(0,0,0,0.04)',
    controlHeight: 32,
    colorSuccess: '#36b37e',
    colorError: '#e8453c',
    colorWarning: '#f0a020',
    colorInfo: '#4e8af0',
    colorBgElevated: 'rgba(255,255,255,0.95)',
  },
  components: {
    Button: {
      borderRadius: 20,
      borderRadiusLG: 20,
      borderRadiusSM: 12,
      primaryShadow: '0 2px 8px rgba(54,179,126,0.25)',
      fontWeight: 500,
    },
    Card: {
      borderRadiusLG: 16,
      colorBgContainer: 'rgba(255,255,255,0.35)',
      boxShadowTertiary: 'none',
    },
    Table: {
      borderRadiusLG: 16,
      colorBgContainer: 'transparent',
      headerBg: 'rgba(255,255,255,0.4)',
      rowHoverBg: 'rgba(255,255,255,0.5)',
    },
    Tag: {
      borderRadiusSM: 12,
    },
    Modal: {
      borderRadiusLG: 16,
    },
    Input: {
      borderRadius: 8,
      borderRadiusLG: 10,
    },
    Select: {
      borderRadius: 8,
    },
    Message: {
      borderRadiusLG: 20,
    },
    Menu: {
      itemBorderRadius: 12,
      itemSelectedBg: '#e3fcef',
      itemSelectedColor: '#36b37e',
      itemHoverBg: 'rgba(54,179,126,0.05)',
      itemHoverColor: '#36b37e',
      subMenuItemBg: 'transparent',
    },
  },
}

function Root() {
  const { lang } = useLang()
  return (
    <ConfigProvider locale={lang === 'en' ? enUS : zhCN} theme={theme}>
      <App />
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <LangProvider>
      <Root />
    </LangProvider>
  </BrowserRouter>,
)
