// api/daily-email.js
//
// Triggered daily by Vercel Cron (see vercel.json) at 5am UTC = 3pm AEST.
// Reads the current sweepstake state from Supabase, builds a results +
// standings summary for each player, and emails the whole thing to Scott
// (the Resend free-tier sender can only deliver to the account owner's
// own address, so this sends ONE email containing all 3 players' updates
// — forward/share manually with Joe and Dad).

const GROUPS = {
  A: ['Mexico','South Korea','South Africa','Czech Republic'],
  B: ['Canada','Switzerland','Qatar','Bosnia'],
  C: ['Brazil','Morocco','Haiti','Scotland'],
  D: ['United States','Paraguay','Australia','Turkey'],
  E: ['Germany','Ecuador',"Côte d'Ivoire",'Curaçao'],
  F: ['Netherlands','Japan','Tunisia','Sweden'],
  G: ['Belgium','Egypt','Iran','New Zealand'],
  H: ['Spain','Uruguay','Saudi Arabia','Cabo Verde'],
  I: ['France','Senegal','Norway','Iraq'],
  J: ['Argentina','Algeria','Austria','Jordan'],
  K: ['Portugal','Colombia','Uzbekistan','DR Congo'],
  L: ['England','Croatia','Ghana','Panama']
};

const FLAGS = {
  'Mexico':'🇲🇽','South Korea':'🇰🇷','South Africa':'🇿🇦','Czech Republic':'🇨🇿',
  'Canada':'🇨🇦','Switzerland':'🇨🇭','Qatar':'🇶🇦','Bosnia':'🇧🇦',
  'Brazil':'🇧🇷','Morocco':'🇲🇦','Haiti':'🇭🇹','Scotland':'🏴',
  'United States':'🇺🇸','Paraguay':'🇵🇾','Australia':'🇦🇺','Turkey':'🇹🇷',
  'Germany':'🇩🇪','Ecuador':'🇪🇨',"Côte d'Ivoire":'🇨🇮','Curaçao':'🇨🇼',
  'Netherlands':'🇳🇱','Japan':'🇯🇵','Tunisia':'🇹🇳','Sweden':'🇸🇪',
  'Belgium':'🇧🇪','Egypt':'🇪🇬','Iran':'🇮🇷','New Zealand':'🇳🇿',
  'Spain':'🇪🇸','Uruguay':'🇺🇾','Saudi Arabia':'🇸🇦','Cabo Verde':'🇨🇻',
  'France':'🇫🇷','Senegal':'🇸🇳','Norway':'🇳🇴','Iraq':'🇮🇶',
  'Argentina':'🇦🇷','Algeria':'🇩🇿','Austria':'🇦🇹','Jordan':'🇯🇴',
  'Portugal':'🇵🇹','Colombia':'🇨🇴','Uzbekistan':'🇺🇿','DR Congo':'🇨🇩',
  'England':'🏴','Croatia':'🇭🇷','Ghana':'🇬🇭','Panama':'🇵🇦'
};

function groupFixtures(g) {
  const t = GROUPS[g];
  return [
    {home:t[0],away:t[1]},
    {home:t[2],away:t[3]},
    {home:t[0],away:t[2]},
    {home:t[1],away:t[3]},
    {home:t[0],away:t[3]},
    {home:t[1],away:t[2]},
  ];
}

function getGroupStandings(groupKey, groupResults) {
  const teams = GROUPS[groupKey];
  const fixtures = groupFixtures(groupKey);
  const pts = {}, gd = {}, gf = {};
  teams.forEach(t => { pts[t]=0; gd[t]=0; gf[t]=0; });
  fixtures.forEach((f,i) => {
    const r = groupResults[`${groupKey}-${i}`];
    if (r && r.homeGoals !== '' && r.awayGoals !== '') {
      const hg = parseInt(r.homeGoals), ag = parseInt(r.awayGoals);
      if (!isNaN(hg) && !isNaN(ag)) {
        gf[f.home]+=hg; gf[f.away]+=ag;
        gd[f.home]+=(hg-ag); gd[f.away]+=(ag-hg);
        if (hg>ag) pts[f.home]+=3;
        else if (hg===ag) { pts[f.home]+=1; pts[f.away]+=1; }
        else pts[f.away]+=3;
      }
    }
  });
  return teams
    .map(t => ({team:t, pts:pts[t], gd:gd[t], gf:gf[t]}))
    .sort((a,b) => b.pts-a.pts || b.gd-a.gd || b.gf-a.gf);
}

function buildResultsSummary(groupResults) {
  const lines = [];
  Object.keys(GROUPS).forEach(g => {
    const fixtures = groupFixtures(g);
    fixtures.forEach((f, i) => {
      const r = groupResults[`${g}-${i}`];
      if (r && r.homeGoals !== '' && r.awayGoals !== '') {
        lines.push({
          group: g,
          home: f.home, away: f.away,
          hg: r.homeGoals, ag: r.awayGoals
        });
      }
    });
  });
  return lines;
}

function teamRank(groupKey, team, groupResults) {
  const standings = getGroupStandings(groupKey, groupResults);
  return standings.findIndex(s => s.team === team) + 1;
}

function buildEmailHtml({ players, allocated, groupResults }) {
  const allTeams = Object.values(GROUPS).flat();
  const results = buildResultsSummary(groupResults);

  const playerSections = players.map((name, pi) => {
    const myTeams = allTeams.filter(t => allocated[t] === pi);

    const rows = myTeams.map(team => {
      const grp = Object.entries(GROUPS).find(([,ts]) => ts.includes(team))?.[0] || '';
      const rank = teamRank(grp, team, groupResults);
      const standings = getGroupStandings(grp, groupResults);
      const myRow = standings.find(s => s.team === team);
      const rankSuffix = rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th';
      return `
        <tr style="border-bottom:1px solid #e2e8f0">
          <td style="padding:6px 8px;font-size:13px">${FLAGS[team]||''} ${team}</td>
          <td style="padding:6px 8px;font-size:12px;color:#666">Group ${grp}</td>
          <td style="padding:6px 8px;font-size:13px;text-align:center">${rank}${rankSuffix}</td>
          <td style="padding:6px 8px;font-size:13px;text-align:center">${myRow.pts} pts</td>
        </tr>`;
    }).join('');

    return `
      <div style="margin-bottom:28px">
        <h2 style="font-family:Arial,sans-serif;font-size:18px;color:#1a6b3c;margin:0 0 10px">
          ${name}'s Teams
        </h2>
        <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif">
          <tr style="background:#1a6b3c;color:#fff">
            <th style="padding:6px 8px;font-size:11px;text-align:left">TEAM</th>
            <th style="padding:6px 8px;font-size:11px;text-align:left">GROUP</th>
            <th style="padding:6px 8px;font-size:11px">RANK</th>
            <th style="padding:6px 8px;font-size:11px">PTS</th>
          </tr>
          ${rows}
        </table>
      </div>`;
  }).join('');

  const resultsHtml = results.length
    ? `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;margin-bottom:24px">
        <tr style="background:#0d1b12;color:#fff">
          <th style="padding:6px 8px;font-size:11px;text-align:left">GROUP</th>
          <th colspan="3" style="padding:6px 8px;font-size:11px;text-align:center">RESULT</th>
        </tr>
        ${results.map(r => `
          <tr style="border-bottom:1px solid #e2e8f0">
            <td style="padding:6px 8px;font-size:12px;color:#666">${r.group}</td>
            <td style="padding:6px 8px;font-size:13px;text-align:right">${FLAGS[r.home]||''} ${r.home}</td>
            <td style="padding:6px 8px;font-size:14px;font-weight:bold;text-align:center">${r.hg} – ${r.ag}</td>
            <td style="padding:6px 8px;font-size:13px;text-align:left">${r.away} ${FLAGS[r.away]||''}</td>
          </tr>`).join('')}
      </table>`
    : `<p style="font-family:Arial,sans-serif;color:#666;font-size:13px">No results recorded yet.</p>`;

  const dateStr = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Brisbane'
  });

  return `
    <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif">
      <div style="background:#1a6b3c;padding:20px;text-align:center;border-radius:8px 8px 0 0">
        <h1 style="color:#f0b429;font-family:Arial,sans-serif;margin:0;font-size:24px">
          🏆 World Cup Sweepstake
        </h1>
        <p style="color:#fff;margin:4px 0 0;font-size:13px">${dateStr}</p>
      </div>
      <div style="padding:20px;background:#f5f9f6;border-radius:0 0 8px 8px">
        <h2 style="font-family:Arial,sans-serif;font-size:16px;color:#0d1b12;margin:0 0 10px">
          📋 Current Results
        </h2>
        ${resultsHtml}
        ${playerSections}
        <p style="font-family:Arial,sans-serif;font-size:12px;color:#888;margin-top:20px">
          Sent automatically each day at 3pm AEST. Forward this to Joe and Dad to keep everyone updated! ⚽
        </p>
      </div>
    </div>`;
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sbResp = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/sweepstake_state?id=eq.main&select=*`,
      {
        headers: {
          apikey: process.env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`
        }
      }
    );
    if (!sbResp.ok) throw new Error(`Supabase fetch failed: ${sbResp.status}`);
    const rows = await sbResp.json();
    const row = rows[0];

    if (!row || !row.allocated || Object.keys(row.allocated).length === 0) {
      return res.status(200).json({ skipped: true, reason: 'No allocation drawn yet' });
    }

    const html = buildEmailHtml({
      players: row.players || ['Player 1','Player 2','Player 3'],
      allocated: row.allocated,
      groupResults: row.group_results || {}
    });

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'World Cup Sweepstake <onboarding@resend.dev>',
        to: [process.env.MY_EMAIL],
        subject: `🏆 World Cup Sweepstake — Daily Update`,
        html
      })
    });

    const resendData = await resendResp.json();
    if (!resendResp.ok) throw new Error(`Resend failed: ${JSON.stringify(resendData)}`);

    return res.status(200).json({ success: true, emailId: resendData.id });
  } catch (err) {
    console.error('daily-email error:', err);
    return res.status(500).json({ error: err.message });
  }
}