import { useState } from 'react';
import { Shield, Moon, Users, Layout, Activity, Settings, LogOut, ChevronRight } from 'lucide-react';

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen p-5">
        <div className="glass-panel w-full max-w-md p-8 border-cyan-500/30">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-400 border border-cyan-500/30 shrink-0">
              <Shield size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white tracking-wider">WhitePrivateDns</h1>
              <p className="text-xs text-cyan-400 font-mono">STANDALONE CONTROLLER</p>
            </div>
            <button className="p-1.5 rounded-lg bg-slate-950/80 text-slate-400 hover:text-amber-300 border border-slate-700 transition">
              <Moon size={16} />
            </button>
          </div>

          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setIsAuthenticated(true); }}>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">ADMIN USERNAME</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-slate-950/80 border border-slate-700 text-white focus:outline-none focus:border-cyan-400 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your admin password"
                className="w-full px-4 py-2.5 rounded-lg bg-slate-950/80 border border-slate-700 text-white focus:outline-none focus:border-cyan-400 text-sm font-mono"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 text-slate-950 font-bold rounded-lg transition duration-200 shadow-lg shadow-cyan-500/20 text-sm"
            >
              AUTHENTICATE & ACCESS
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar Navigation */}
      <nav className="w-64 glass-panel border-r border-y-0 border-l-0 rounded-none flex flex-col p-4 shadow-none border-slate-800">
        <div className="flex items-center gap-3 mb-8 px-2 mt-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400 border border-cyan-500/30">
            <Shield size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">WhitePrivateDns</h2>
            <div className="text-[10px] text-cyan-400 font-mono">v3.0.0-react</div>
          </div>
        </div>

        <div className="space-y-1 flex-1">
          {[
            { icon: Layout, label: 'Dashboard', active: true },
            { icon: Users, label: 'Clients' },
            { icon: Activity, label: 'Diagnostics' },
            { icon: Settings, label: 'Settings' }
          ].map((item, i) => (
            <button key={i} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${item.active ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}>
              <item.icon size={16} />
              <span className="font-semibold">{item.label}</span>
              {item.active && <ChevronRight size={14} className="ml-auto" />}
            </button>
          ))}
        </div>

        <div className="border-t border-slate-800 pt-4 mt-4">
          <button
            onClick={() => setIsAuthenticated(false)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-950/30 transition-colors"
          >
            <LogOut size={16} />
            <span className="font-semibold">Sign Out</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          <header className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white">Dashboard Overview</h1>
              <p className="text-slate-400 text-sm mt-1">System status and recent activity</p>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="glass-panel p-5 border-t-2 border-t-cyan-500">
              <div className="text-slate-400 text-xs font-semibold mb-1">TOTAL CLIENTS</div>
              <div className="text-3xl font-bold text-white mt-2">124</div>
            </div>
            <div className="glass-panel p-5 border-t-2 border-t-amber-500">
              <div className="text-slate-400 text-xs font-semibold mb-1">ACTIVE CONNECTIONS</div>
              <div className="text-3xl font-bold text-white mt-2">42</div>
            </div>
            <div className="glass-panel p-5 border-t-2 border-t-emerald-500">
              <div className="text-slate-400 text-xs font-semibold mb-1">SYSTEM STATUS</div>
              <div className="text-3xl font-bold text-emerald-400 mt-2">OPTIMAL</div>
            </div>
          </div>

          <div className="glass-panel p-6 min-h-[400px] mt-6">
            <h3 className="text-lg font-bold text-white mb-4">Traffic Usage</h3>
            <div className="flex items-center justify-center h-64 border border-dashed border-slate-700/50 rounded-lg bg-slate-900/50">
              <span className="text-slate-500 font-mono text-sm">Chart Component Placeholder</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
