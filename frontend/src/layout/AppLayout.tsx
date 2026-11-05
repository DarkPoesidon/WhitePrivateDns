import {
  ApiOutlined,
  AppstoreOutlined,
  DashboardOutlined,
  ExportOutlined,
  FileTextOutlined,
  GlobalOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Button, Drawer, Dropdown, Grid, Layout, Menu, Space, Typography } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { ADMIN_BASE, signOut } from '../api/client'
import i18n from '../i18n'
import { useMode, type Mode } from '../theme'
import UpdateBanner from './UpdateBanner'

const { Sider, Header, Content } = Layout

const CLASSIC = '__classic'
const ITEMS = [
  { key: '/overview', icon: <DashboardOutlined />, label: 'nav.overview' },
  { key: '/clients', icon: <TeamOutlined />, label: 'nav.clients' },
  { key: '/policies', icon: <SafetyCertificateOutlined />, label: 'nav.policies' },
  { key: '/logs', icon: <FileTextOutlined />, label: 'nav.logs' },
  { key: '/api', icon: <ApiOutlined />, label: 'nav.api' },
  { key: '/settings', icon: <SettingOutlined />, label: 'nav.settings' },
  { key: '/guide', icon: <AppstoreOutlined />, label: 'nav.guide' },
]

export default function AppLayout() {
  const { t } = useTranslation()
  const { mode, setMode } = useMode()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const screens = Grid.useBreakpoint()
  const mobile = screens.md === false
  const [collapsed, setCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(false)

  const menu = (
    <Menu
      mode="inline"
      selectedKeys={[ITEMS.find((i) => pathname.startsWith(i.key))?.key ?? '/overview']}
      items={[
        ...ITEMS.map((i) => ({ key: i.key, icon: i.icon, label: t(i.label) })),
        { type: 'divider' as const },
        { key: CLASSIC, icon: <ExportOutlined />, label: t('nav.classic') },
      ]}
      onClick={({ key }) => {
        // The classic dashboard stays available as a fallback.
        if (key === CLASSIC) {
          window.location.assign(`${ADMIN_BASE}/dash/`)
          return
        }
        nav(key)
        setDrawer(false)
      }}
      style={{ borderInline: 0, background: 'transparent' }}
    />
  )

  const modes: Mode[] = ['light', 'dark', 'ultra']
  const brand = (
    <Typography.Text strong style={{ fontSize: 16, padding: '0 20px', display: 'block', lineHeight: '56px', whiteSpace: 'nowrap' }}>
      {collapsed && !mobile ? 'W' : 'WhitePrivateDns'}
    </Typography.Text>
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!mobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          theme={mode === 'light' ? 'light' : 'dark'}
          width={220}
          style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'auto' }}
        >
          {brand}
          {menu}
        </Sider>
      )}
      {mobile && (
        <Drawer open={drawer} onClose={() => setDrawer(false)} placement={i18n.dir() === 'rtl' ? 'right' : 'left'} size={240} styles={{ body: { padding: 0 } }} title="WhitePrivateDns">
          {menu}
        </Drawer>
      )}
      <Layout>
        <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 16, position: 'sticky', top: 0, zIndex: 10 }}>
          <Button
            type="text"
            aria-label="Toggle menu"
            icon={mobile || collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => (mobile ? setDrawer(true) : setCollapsed((c) => !c))}
          />
          <Space>
            <Dropdown
              menu={{
                selectedKeys: [mode],
                items: modes.map((m) => ({ key: m, label: t(`common.${m}`) })),
                onClick: ({ key }) => setMode(key as Mode),
              }}
            >
              <Button type="text">{t('common.theme')}</Button>
            </Dropdown>
            <Dropdown
              menu={{
                selectedKeys: [i18n.language],
                items: [
                  { key: 'en', label: 'English' },
                  { key: 'fa', label: 'فارسی' },
                ],
                onClick: ({ key }) => {
                  try {
                    localStorage.setItem('wpdns_ui_lang', key)
                  } catch {
                    /* storage blocked */
                  }
                  void i18n.changeLanguage(key)
                },
              }}
            >
              <Button type="text" icon={<GlobalOutlined />} aria-label={t('common.language')} />
            </Dropdown>
            <Button type="text" icon={<LogoutOutlined />} onClick={signOut} aria-label={t('common.signOut')} />
          </Space>
        </Header>
        <UpdateBanner />
        <Content style={{ padding: mobile ? 12 : 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
