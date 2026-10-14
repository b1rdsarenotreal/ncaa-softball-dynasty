"""Builds js/data.js from the ratings CSV and the team table.

    python3 tools/build_data.py <ratings.csv> <teams.txt>

teams.txt has one line per team: csvName|School|ABBR|Mascot|#color|#alt|Coach.
Starting ratings come from the CSV: a strength number that blends ELO (50%),
TSR (35%) and PCR (15%), each put on the ELO scale, then converted to the
app's 40-99 scale so a rating gap gives about the same win chance as the ELO
gap. OFF / PIT / DEF are spread around that overall rating by a fixed,
per-school pattern (the CSV has no hitting/pitching split), keeping
OVR = 40% OFF + 40% PIT + 20% DEF.
"""
import csv, hashlib, json, sys

# Conference moves that took effect July 2025, before the 2026 season.
REALIGN_2026 = {
    'Grand Canyon': 'Mountain West',
    'Seattle U': 'West Coast',
    'Delaware': 'Conference USA',
    'Missouri St.': 'Conference USA',
}
CONF_NAMES = {'The Summit League': 'Summit League'}

CONFERENCES = {
    'ACC': ('ACC', '#013CA6'), 'America East': ('AE', '#1B365D'), 'American Athletic': ('AAC', '#0D2240'),
    'ASUN': ('ASUN', '#0A3161'), 'Atlantic 10': ('A10', '#00205B'), 'Big 12': ('B12', '#C8102E'),
    'Big East': ('BE', '#002D72'), 'Big Sky': ('BSKY', '#00558C'), 'Big South': ('BSO', '#B3242B'),
    'Big Ten': ('B1G', '#0088CE'), 'Big West': ('BW', '#0E7C86'), 'Coastal Athletic': ('CAA', '#003C71'),
    'Conference USA': ('CUSA', '#0A2240'), 'Horizon League': ('HL', '#002D62'), 'Ivy League': ('IVY', '#00693E'),
    'MAAC': ('MAAC', '#0072CE'), 'MEAC': ('MEAC', '#002F6C'), 'Mid-American': ('MAC', '#00843D'),
    'Missouri Valley': ('MVC', '#C8102E'), 'Mountain West': ('MW', '#6A2C91'), 'Northeast': ('NEC', '#003087'),
    'Ohio Valley': ('OVC', '#0055A5'), 'Patriot League': ('PL', '#003865'), 'SEC': ('SEC', '#004B8D'),
    'Southern': ('SoCon', '#002855'), 'Southland': ('SLC', '#4B2E83'), 'Summit League': ('SUM', '#5A2D82'),
    'Sun Belt': ('SBC', '#002F6C'), 'SWAC': ('SWAC', '#00205B'), 'West Coast': ('WCC', '#B3261E'),
    'Western Athletic': ('WAC', '#002F6C'),
}

# Names the ESPN logo list may know a school by.
LOGO_ALIASES = {
    'UConn': 'Connecticut', 'App State': 'Appalachian State', 'UAlbany': 'Albany', 'Hawaii': "Hawai'i",
    'Kansas City': 'UMKC', 'IU Indy': 'IUPUI', 'Seattle U': 'Seattle', 'Southern': 'Southern University',
    'Incarnate Word': 'Incarnate Word', 'Texas A&M-Corpus Christi': 'Texas A&M-Corpus Christi',
    'Cal State Northridge': 'CSUN', 'Cal Baptist': 'California Baptist', 'Charleston': 'Charleston',
    'Loyola Marymount': 'LMU', 'UMass': 'Massachusetts', 'NC Central': 'North Carolina Central',
    'NC A&T': 'North Carolina A&T', 'UNC Wilmington': 'UNCW', 'SIU Edwardsville': 'SIU Edwardsville',
    'Arkansas-Pine Bluff': 'Arkansas-Pine Bluff', 'Maryland Eastern Shore': 'Maryland-Eastern Shore',
    'Saint Mary\'s': "Saint Mary's", 'Miami (OH)': 'Miami (OH)', 'LIU': 'Long Island University',
    'FDU': 'Fairleigh Dickinson', 'Grambling State': 'Grambling', 'Alcorn State': 'Alcorn State',
    'Southeast Missouri': 'Southeast Missouri State', 'UT Martin': 'UT Martin', 'Purdue Fort Wayne': 'Purdue Fort Wayne',
    'Ole Miss': 'Ole Miss', 'Army': 'Army', 'Prairie View A&M': 'Prairie View', 'Northern Iowa': 'Northern Iowa',
}


def z(xs):
    m = sum(xs) / len(xs)
    sd = (sum((x - m) ** 2 for x in xs) / len(xs)) ** 0.5
    return [(x - m) / sd for x in xs], m, sd


def main(csv_path, teams_path):
    rows = list(csv.DictReader(open(csv_path, encoding='utf-8')))
    info = {}
    for line in open(teams_path, encoding='utf-8'):
        if line.strip():
            k, school, abbr, mascot, color, alt, coach = line.rstrip('\n').split('|')
            info[k] = (school, abbr, mascot, color, alt, coach)

    elo = [float(r['ELO']) for r in rows]
    zt, _, _ = z([float(r['TSR']) for r in rows])
    zp, _, _ = z([float(r['PCR']) for r in rows])
    _, em, esd = z(elo)
    blend = [0.5 * e + 0.35 * (em + t * esd) + 0.15 * (em + p * esd) for e, t, p in zip(elo, zt, zp)]
    # 0.126 per OVR point (sim.js winProbability) vs ln(10)/400 per ELO point.
    per_point = 0.126 / (2.302585 / 400)

    teams = []
    for r, b in zip(rows, blend):
        school, abbr, mascot, color, alt, coach = info[r['Team']]
        conf = REALIGN_2026.get(r['Team'], CONF_NAMES.get(r['Conference'], r['Conference']))
        o = 50 + (b - 1000) / per_point
        h = hashlib.sha256(school.encode()).digest()
        a = (h[0] / 255 - 0.5) * 8      # OFF vs PIT lean, ±4
        d = (h[1] / 255 - 0.5) * 3      # DEF lean, ±1.5
        off, pit, df = o + a - d / 2, o - a - d / 2, o + 2 * d
        off, pit, df = (max(40, min(99, round(x))) for x in (off, pit, df))
        teams.append([school, conf, abbr, mascot, color, alt, off, pit, df, coach])

    teams.sort(key=lambda t: (t[1], t[0]))
    out = ['// Starting league: the 300 NCAA Division I softball programs in the ratings',
           '// file, their 2026 conferences and head coaches. Colors are each school\'s',
           '// colors. OFF / PIT / DEF (40–99) come from the ratings file (ELO, TSR and',
           '// PCR); see tools/build_data.py. Everything is editable in the app.',
           '', 'export const START_YEAR = 2026;', '', 'export const CONFERENCES = {']
    for c in sorted({t[1] for t in teams}):
        ab, col = CONFERENCES[c]
        out.append(f'  {json.dumps(c)}: {{ abbr: {json.dumps(ab)}, color: {json.dumps(col)} }},')
    out += ['};', '', '// [school, conference, abbr, mascot, color, altColor, OFF, PIT, DEF]', 'const T = [']
    for t in teams:
        out.append('  [' + ', '.join(json.dumps(x, ensure_ascii=False) for x in t[:9]) + '],')
    out += ['];', '', '// Names the logo list may know a school by.',
            'export const LOGO_ALIASES = ' + json.dumps(LOGO_ALIASES, ensure_ascii=False) + ';', '',
            '// Head coaches for the 2026 season (editable in the app).', 'export const COACHES = {']
    for t in sorted(teams):
        out.append(f'  {json.dumps(t[0], ensure_ascii=False)}: {json.dumps(t[9], ensure_ascii=False)},')
    out.append('};')
    return '\n'.join(out) + '\n'


if __name__ == '__main__':
    sys.stdout.write(main(sys.argv[1], sys.argv[2]))
