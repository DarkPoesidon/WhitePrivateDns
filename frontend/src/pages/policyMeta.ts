// Preset grouping. Keys are the server's `enable_*` rule keys (internal/core/matcher PresetRuleKeys);
// names and descriptions are translated under i18n `policies.preset.<key without "enable_">`.
// `tags` are brand names, shown verbatim in every language.

export type GroupId = 'gaming' | 'streaming' | 'security' | 'bandwidth'

export interface PresetMeta {
  id: string // key without the enable_ prefix
  tags: string
}

export const GROUPS: { id: GroupId; presets: PresetMeta[] }[] = [
  {
    id: 'gaming',
    presets: [
      { id: 'riot', tags: 'Valorant · LoL · Vanguard' },
      { id: 'epic', tags: 'Store · Fortnite · EAC' },
      { id: 'steam', tags: 'Community · CS2 · Dota 2' },
      { id: 'pubg', tags: 'Krafton · Level Infinite' },
      { id: 'call_of_duty', tags: 'CODM · Warzone' },
      { id: 'supercell', tags: 'Brawl Stars · Clash Royale' },
      { id: 'ea', tags: 'EA App · Apex Legends' },
      { id: 'blizzard', tags: 'Overwatch · WoW' },
      { id: 'ubisoft', tags: 'Rainbow Six · AC' },
      { id: 'rockstar', tags: 'GTA Online · RDR2' },
      { id: 'xbox', tags: 'Xbox Live · Minecraft' },
      { id: 'playstation', tags: 'PSN · PS5 / PS4 Store' },
      { id: 'roblox', tags: 'Client · Assets CDN' },
      { id: 'shooters_extra', tags: 'Tarkov · The Finals · R6' },
      { id: 'anime_gacha', tags: 'Genshin · ZZZ · PoE 2' },
      { id: 'sports_racing', tags: 'FC 25 · SF6 · Tekken 8' },
      { id: 'coop_survival', tags: 'Palworld · Among Us · ARK' },
      { id: 'platforms_extra', tags: 'GeForce Now · AMD · GameLoop' },
    ],
  },
  {
    id: 'streaming',
    presets: [
      { id: 'discord', tags: 'Updates · RTC voice' },
      { id: 'spotify', tags: 'Music' },
      { id: 'soundcloud', tags: 'Music' },
      { id: 'twitch', tags: 'Streams · Chat' },
      { id: 'kick', tags: 'Live streaming' },
      { id: 'google', tags: 'Search · Gmail · YouTube' },
      { id: 'ai', tags: 'Copilot · Gemini · Grok' },
      { id: 'social', tags: 'X · Instagram · Telegram' },
    ],
  },
  {
    id: 'security',
    presets: [
      { id: 'dev403', tags: 'Docker · OpenAI · Claude · npm' },
      { id: 'adblock', tags: 'Sinkhole · 0.0.0.0' },
      { id: 'familysafe', tags: 'Adult content filter' },
    ],
  },
  { id: 'bandwidth', presets: [{ id: 'downloads', tags: 'Steam · Epic · Xbox · PSN · Battle.net · Riot · EA · GOG' }] },
]

export const KNOWN = new Set(GROUPS.flatMap((g) => g.presets.map((p) => `enable_${p.id}`)))

// One-click bundles. Deliberately never include `downloads`: turning it on in one click is
// the bill nobody expects.
export const PROFILES: { id: 'gamer' | 'streamer' | 'dev' | 'safe'; keys: string[] }[] = [
  { id: 'gamer', keys: GROUPS[0].presets.map((p) => `enable_${p.id}`) },
  { id: 'streamer', keys: ['enable_discord', 'enable_twitch', 'enable_kick', 'enable_spotify', 'enable_soundcloud'] },
  { id: 'dev', keys: ['enable_dev403'] },
  { id: 'safe', keys: ['enable_adblock', 'enable_familysafe'] },
]
