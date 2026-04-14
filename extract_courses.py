#!/usr/bin/env python3
"""
Extract all course data from downloaded Course_Pages/ HTML files.

Parses the locally saved course detail pages and extracts:
- LV-Nr, Fachname, Typ, SWS, ECTS
- Vortragende (lecturers)
- Lehrstuhl / Organisationseinheit
- Termine (schedule: day, time, room, date range)

Outputs: kurse_komplett.json (for the planner web app)

Usage:
    python3 extract_courses.py
"""

import os
import re
import glob
import json
from bs4 import BeautifulSoup


def extract_course_from_html(filepath: str) -> dict:
    """Extract all relevant course data from a single course detail HTML file."""
    fname = os.path.basename(filepath)

    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    soup = BeautifulSoup(html, "html.parser")
    page_text = soup.get_text()

    course = {}

    # ── LV-Nr and name from filename ──
    lv_match = re.match(r'^([\d\w.-]+)_(.+)\.html$', fname)
    if lv_match:
        course["LV-Nr"] = lv_match.group(1).replace("-", ".")
        course["Fachname"] = lv_match.group(2).replace("_", " ")

    # ── Try to get structured info from page title ──
    # Pattern: "12.00056 | Title | VO | 4 | SWS | 9 | ECTS | ..."
    page_title = soup.find("h1")
    if page_title:
        title_text = page_title.get_text(strip=True)
        # "Lehrveranstaltungen / Actions and Planning in AI..."
        if "/" in title_text:
            course["Fachname"] = title_text.split("/", 1)[1].strip()

    # ── Course Type (VO, UE, SE, VU, ...) ──
    type_match = re.search(
        r'\b(VO|UE|SE|VU|PR|PJ|KO|EX|AG|BL|HS|OS|TU|RE|SV|SP)\b.*?'
        r'(\d+)\s*SWS',
        page_text
    )
    if type_match:
        course["Typ"] = type_match.group(1)

    # Fallback: check the overview summary line
    if "Typ" not in course:
        summary_match = re.search(
            r'(?:' + re.escape(course.get("LV-Nr", "")) + r'.*?)'
            r'(VO|UE|SE|VU|PR|PJ|KO|EX|AG|BL|HS|OS|TU|RE|SV|SP)',
            page_text
        )
        if summary_match:
            course["Typ"] = summary_match.group(1)

    # ── SWS ──
    sws_match = re.search(r'Semesterwochenstunden\s*(\d+)', page_text)
    if sws_match:
        course["SWS"] = int(sws_match.group(1))
    else:
        sws_match2 = re.search(r'(\d+)\s*SWS', page_text)
        if sws_match2:
            course["SWS"] = int(sws_match2.group(1))

    # ── ECTS ──
    ects_match = re.search(r'(\d+(?:[.,]\d+)?)\s*ECTS', page_text)
    if ects_match:
        course["ECTS"] = float(ects_match.group(1).replace(",", "."))

    # ── Vortragende (lecturers) ──
    vortragende = []
    # Use Angular's ca-businesscard-link components which wrap actual lecturer names
    bc_links = soup.find_all("ca-businesscard-link")
    for bc in bc_links:
        name = bc.get_text(strip=True)
        if name and 2 < len(name) < 100 and name not in vortragende:
            vortragende.append(name)
    course["Vortragende"] = "; ".join(vortragende) if vortragende else ""

    # ── Organisationseinheit / Lehrstuhl ──
    lehrstuhl = ""
    org_el = soup.find(string=re.compile(r'Organisationseinheit'))
    if org_el:
        row = org_el.parent
        for _ in range(4):
            if row.parent and row.parent.name:
                row = row.parent
        text = row.get_text(separator="|", strip=True)
        parts = [p.strip() for p in text.split("|") if p.strip()]
        for p in parts:
            if any(x in p for x in ["Lehrstuhl", "Institut", "Lehr- und Forschung",
                                      "Fachgruppe", "Abteilung"]):
                lehrstuhl = p
                break
        # If not found, try the part after "Organisationseinheit"
        if not lehrstuhl:
            for j, p in enumerate(parts):
                if "Organisationseinheit" in p and j + 1 < len(parts):
                    lehrstuhl = parts[j + 1]
                    break

    # Fallback: search in all links
    if not lehrstuhl:
        for link in soup.find_all("a", href=True):
            href = link.get("href", "")
            if "/org/" in href or "orgId=" in href:
                text = link.get_text(strip=True)
                if text and 5 < len(text) < 200:
                    lehrstuhl = text
                    break

    # Fallback: search in general text
    if not lehrstuhl:
        for text_el in soup.find_all(string=re.compile(
                r'Lehrstuhl|Institut für|Lehr- und Forschungsgebiet')):
            text = text_el.strip()
            if 10 < len(text) < 200:
                lehrstuhl = text
                break

    course["Lehrstuhl"] = lehrstuhl

    # ── Termine (schedule) ──
    termine = []
    seen_slots = set()

    for appt in soup.find_all("div", class_="compact-appointment"):
        icon_div = appt.find("div", class_="compact-appointment-icon")
        info_div = appt.find("div", class_="compact-appointment-info")

        if not info_div:
            continue

        info_text = info_div.get_text(separator=" ", strip=True)

        day_match = re.search(
            r'(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)',
            info_text
        )
        time_match = re.search(
            r'(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})',
            info_text
        )
        date_match = re.search(
            r'von\s+(\d{2}\.\d{2}\.\d{4})\s+bis\s+(\d{2}\.\d{2}\.\d{4})',
            info_text
        )

        if not (day_match and time_match):
            continue

        termin = {
            "typ": icon_div.get_text(strip=True) if icon_div else "",
            "tag": day_match.group(1),
            "von": time_match.group(1),
            "bis": time_match.group(2),
        }

        if date_match:
            termin["start_datum"] = date_match.group(1)
            termin["end_datum"] = date_match.group(2)

        # Room
        if date_match:
            rest = info_text[date_match.end():].strip()
            if rest:
                termin["raum"] = rest

        # Deduplicate by day+time (keep unique slots)
        slot_key = f"{termin['tag']}_{termin['von']}_{termin['bis']}"
        if slot_key not in seen_slots:
            seen_slots.add(slot_key)
            termine.append(termin)

    course["Termine"] = termine

    # ── Generate ID ──
    course["id"] = course.get("LV-Nr", fname.replace(".html", ""))

    return course


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pages_dir = os.path.join(script_dir, "Course_Pages")
    output_json = os.path.join(script_dir, "planner", "kurse_komplett.json")

    print("=" * 65)
    print("  RWTH Kurs-Extraktor (aus heruntergeladenen Seiten)")
    print("=" * 65)

    # Find all HTML files
    html_files = sorted(glob.glob(os.path.join(pages_dir, "*.html")))

    if not html_files:
        print(f"\n  ❌ Keine HTML-Dateien in {pages_dir} gefunden!")
        print("     Bitte zuerst download_courses.py ausführen.")
        return

    print(f"\n  📂 {len(html_files)} Kursseiten gefunden in Course_Pages/")
    print("  ⏳ Extrahiere Daten...\n")

    courses = []
    for i, fpath in enumerate(html_files):
        course = extract_course_from_html(fpath)
        courses.append(course)

        if (i + 1) % 50 == 0:
            print(f"     {i+1}/{len(html_files)} verarbeitet...")

    # Stats
    with_termine = sum(1 for c in courses if c.get("Termine"))
    with_ls = sum(1 for c in courses if c.get("Lehrstuhl"))
    total_slots = sum(len(c.get("Termine", [])) for c in courses)

    print(f"\n  📊 Statistik:")
    print(f"     {len(courses)} Kurse extrahiert")
    print(f"     {with_termine} mit Terminen ({len(courses) - with_termine} ohne)")
    print(f"     {with_ls} mit Lehrstuhl")
    print(f"     {total_slots} Termineinträge insgesamt")

    # Save JSON
    os.makedirs(os.path.dirname(output_json), exist_ok=True)
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(courses, f, ensure_ascii=False, indent=2)

    print(f"\n  ✅ Gespeichert: {output_json}")
    print(f"\n{'=' * 65}")
    print("  Fertig! Öffne planner/index.html im Browser zum Planen.")
    print(f"{'=' * 65}")


if __name__ == "__main__":
    main()
