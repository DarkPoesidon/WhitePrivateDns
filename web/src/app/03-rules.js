// =======================================================
// SAVE RULES API
// =======================================================
async function saveRules() {
  if (!currentConfig) return;

  const payload = {
    enable_riot: getSwitch('preset-riot'),
    enable_epic: getSwitch('preset-epic'),
    enable_steam: getSwitch('preset-steam'),
    enable_pubg: getSwitch('preset-pubg'),
    enable_call_of_duty: getSwitch('preset-cod'),
    enable_supercell: getSwitch('preset-supercell'),
    enable_discord: getSwitch('preset-discord'),
    enable_ea: getSwitch('preset-ea'),
    enable_blizzard: getSwitch('preset-blizzard'),
    enable_ubisoft: getSwitch('preset-ubisoft'),
    enable_rockstar: getSwitch('preset-rockstar'),
    enable_xbox: getSwitch('preset-xbox'),
    enable_playstation: getSwitch('preset-playstation'),
    enable_roblox: getSwitch('preset-roblox'),
    enable_shooters_extra: getSwitch('preset-shooters-extra'),
    enable_anime_gacha: getSwitch('preset-anime-gacha'),
    enable_sports_racing: getSwitch('preset-sports-racing'),
    enable_coop_survival: getSwitch('preset-coop-survival'),
    enable_platforms_extra: getSwitch('preset-platforms-extra'),
    enable_spotify: getSwitch('preset-spotify'),
    enable_soundcloud: getSwitch('preset-spotify'),
    enable_twitch: getSwitch('preset-twitch'),
    enable_kick: getSwitch('preset-kick'),
    enable_google: getSwitch('preset-google'),
    enable_ai: getSwitch('preset-ai'),
    enable_social: getSwitch('preset-social'),
    enable_dev403: getSwitch('preset-dev403'),
    enable_adblock: getSwitch('preset-adblock'),
    enable_familysafe: getSwitch('preset-familysafe'),
    enable_downloads: getSwitch('preset-downloads'),
    custom_proxied: currentConfig.rules.custom_proxied,
    custom_blocked: currentConfig.rules.custom_blocked,
    custom_direct: currentConfig.rules.custom_direct,
    custom_records: currentConfig.rules.custom_records
  };

  try {
    const res = await fetch(api('/api/config/rules'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      currentConfig.rules = payload;
      showToast('Policies updated & active!', 'success');
    }
  } catch (e) {
    showToast('Failed to save policies', 'error');
  }
}
