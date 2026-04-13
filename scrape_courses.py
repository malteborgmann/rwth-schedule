#!/usr/bin/env python3
"""
Scraper for RWTH Aachen RWTHonline course data.

1) Parses locally saved HTML files to extract course names, lecturers, and links.
2) Uses Selenium to visit each course detail page and extract:
   - Lehrstuhl (Chair/Organisation)
   - Termine (Schedule: weekday, time, room, start/end dates)
3) Saves everything to CSV and JSON (for the schedule planner tool).

Usage:
    python3 scrape_courses.py

The script will open Chrome so you can log in to RWTHonline manually.
After login, it will automatically visit each course page and extract the data.
"""

import csv
import os
import sys
import time
import glob
import json
import re
from bs4 import BeautifulSoup

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException


# ─────────────────────────────────────────────────────────────
# STEP 1: Parse local HTML files for course list data
# ─────────────────────────────────────────────────────────────

def parse_html_files(directory: str) -> list:
    """Parse all HTML files in the given directory and extract course data."""
    courses = []
    html_files = sorted(glob.glob(os.path.join(directory, "HTML*.html")))

    if not html_files:
        print(f"  ❌ Keine HTML-Dateien in {directory} gefunden!")
        return courses

    for html_file in html_files:
        print(f"  📄 Parse: {os.path.basename(html_file)}")
        with open(html_file, "r", encoding="utf-8") as f:
            html_content = f.read()

        soup = BeautifulSoup(html_content, "html.parser")
        list_entries = soup.find_all("ca-list-entry")

        for entry in list_entries:
            course = {}

            # Course Number
            course_number_el = entry.find("slc-course-number")
            if course_number_el:
                span = course_number_el.find("span")
                course["LV-Nr"] = span.get_text(strip=True) if span else ""

            # Course Title
            title_el = entry.find("slc-course-title")
            if title_el:
                title_span = title_el.find("span", class_="list-entry-title")
                course["Fachname"] = title_span.get_text(strip=True) if title_span else ""

            # Course Link
            if title_el:
                link_el = title_el.find("a", class_="ca-link")
                if link_el and link_el.get("href"):
                    course["Link"] = link_el["href"]
                else:
                    course["Link"] = ""

            # Lecturers
            lecturers = []
            lectureships_el = entry.find("tm-lectureships")
            if lectureships_el:
                lecturer_links = lectureships_el.find_all("tm-lectureship-link")
                for lec in lecturer_links:
                    bc_link = lec.find("ca-businesscard-link")
                    if bc_link:
                        spans = bc_link.find_all("span", recursive=True)
                        for span in spans:
                            text = span.get_text(strip=True)
                            if (text
                                and "show_more" not in (span.get("class") or [])
                                and "businesscard-link" not in (span.get("class") or [])
                                and not span.find("span")
                                and text not in lecturers):
                                lecturers.append(text)
                                break
            course["Vortragende"] = "; ".join(lecturers) if lecturers else ""

            # Course Type
            course_type = ""
            info_divs = entry.find_all("div", attrs={"_ngcontent-ng-c4113725912": True})
            for div in info_divs:
                first_span = div.find("span", recursive=False)
                if first_span:
                    txt = first_span.get_text(strip=True)
                    if txt in ["VO", "UE", "SE", "VU", "PR", "PJ", "KO", "EX", "AG",
                               "BL", "HS", "OS", "TU", "RE", "SV", "SP"]:
                        course_type = txt
                        break
            course["Typ"] = course_type

            if course.get("Fachname"):
                courses.append(course)

    # Deduplicate
    seen = set()
    unique_courses = []
    for c in courses:
        key = c.get("LV-Nr", "") + "|" + c.get("Fachname", "")
        if key not in seen:
            seen.add(key)
            unique_courses.append(c)

    print(f"\n  → {len(unique_courses)} einzigartige Kurse aus {len(html_files)} HTML-Dateien extrahiert.")
    return unique_courses


# ─────────────────────────────────────────────────────────────
# STEP 2: Selenium – Login & Data extraction
# ─────────────────────────────────────────────────────────────

def create_driver():
    """Create and return a Chrome WebDriver instance."""
    chrome_options = Options()
    chrome_options.add_experimental_option("detach", True)
    chrome_options.add_argument("--window-size=1400,900")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-logging"])
    driver = webdriver.Chrome(options=chrome_options)
    return driver


def wait_for_login(driver):
    """Navigate to RWTHonline and wait for the user to log in."""
    login_url = "https://online.rwth-aachen.de/RWTHonline/ee/ui/ca2/app/desktop/#/home"
    driver.get(login_url)

    print("\n  🔐 Bitte logge dich im Browser bei RWTHonline ein!")
    print("     Das Script wartet, bis der Login abgeschlossen ist...")
    print("     (Timeout: 5 Minuten)\n")

    try:
        WebDriverWait(driver, 300).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, "[data-test='id_brm-pm-dtop_navbar_username-label']")
            )
        )
        print("  ✅ Login erkannt! Starte Datenextraktion...\n")
        time.sleep(2)
        return True
    except TimeoutException:
        print("  ❌ Login-Timeout! Bitte starte das Script erneut.")
        return False


def extract_course_detail(driver, course_link: str, timeout: int = 15) -> dict:
    """
    Visit a course detail page and extract:
    - Lehrstuhl (organisation/chair)  
    - Termine (schedule: weekday, time, room, dates)
    """
    result = {"Lehrstuhl": "", "Termine": []}
    
    if not course_link:
        return result

    try:
        driver.get(course_link)

        # Wait for the course detail page to load
        WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, "ca-page, .ca-page-content, .pageContent")
            )
        )
        time.sleep(2)

        page_source = driver.page_source
        soup = BeautifulSoup(page_source, "html.parser")

        # ── Extract Lehrstuhl ──
        lehrstuhl = ""
        
        # Strategy 1: Look for org-related text
        org_elements = soup.find_all(
            lambda tag: tag.name and any(
                x in tag.get_text(strip=True)
                for x in ["Lehrstuhl", "Institut für", "Lehr- und Forschungsgebiet"]
            ) and len(tag.get_text(strip=True)) < 200
        )
        for el in org_elements:
            text = el.get_text(strip=True)
            if ("Lehrstuhl" in text or "Institut" in text
                    or "Lehr- und Forschungsgebiet" in text):
                lehrstuhl = text
                break

        # Strategy 2: Try Selenium directly
        if not lehrstuhl:
            try:
                org_els = driver.find_elements(
                    By.XPATH,
                    "//*[contains(text(), 'Lehrstuhl') or contains(text(), 'Institut für') "
                    "or contains(text(), 'Lehr- und Forschungsgebiet')]"
                )
                for el in org_els:
                    text = el.text.strip()
                    if text and len(text) < 200:
                        lehrstuhl = text
                        break
            except Exception:
                pass

        # Strategy 3: Links to org pages
        if not lehrstuhl:
            org_links = soup.find_all("a", href=True)
            for link in org_links:
                href = link.get("href", "")
                if "/org/" in href or "orgId=" in href:
                    text = link.get_text(strip=True)
                    if text and len(text) > 5 and len(text) < 200:
                        lehrstuhl = text
                        break

        result["Lehrstuhl"] = lehrstuhl.strip()

        # ── Extract Termine ──
        # First, try to click on "Termine und Gruppen" section to load dates
        try:
            termine_section = driver.find_element(
                By.XPATH,
                "//li[contains(@aria-label, 'Termine')]//a | "
                "//a[contains(text(), 'Termine')]"
            )
            termine_section.click()
            time.sleep(2)  # Wait for section to load/scroll
        except (NoSuchElementException, Exception):
            pass

        # Now try to extract schedule data from the page
        page_source = driver.page_source
        soup = BeautifulSoup(page_source, "html.parser")
        
        termine = extract_termine_from_page(soup, driver)
        result["Termine"] = termine

    except TimeoutException:
        result["Lehrstuhl"] = "(Timeout)"
    except Exception as e:
        result["Lehrstuhl"] = f"(Fehler: {str(e)[:50]})"

    return result


def extract_termine_from_page(soup, driver) -> list:
    """
    Extract schedule/appointment data from the course detail page.
    
    RWTHonline typically shows dates in a table or list format with:
    - Day of week (Tag)
    - Time (Von-Bis)
    - Room (Raum)
    - Rhythm (wöchentlich, 14-täglich, Einzeltermin)
    - Date range (von, bis)
    """
    termine = []
    
    # Strategy 1: Look for table rows with date information
    # The dates section typically has a table with course schedule
    tables = soup.find_all("table")
    for table in tables:
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all(["td", "th"])
            if len(cells) >= 2:
                row_text = [cell.get_text(strip=True) for cell in cells]
                # Check if this row contains schedule-like data
                row_combined = " ".join(row_text)
                if any(day in row_combined for day in 
                       ["Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa.", "So.",
                        "Montag", "Dienstag", "Mittwoch", "Donnerstag", 
                        "Freitag", "Samstag", "Sonntag",
                        "Mon", "Tue", "Wed", "Thu", "Fri"]):
                    termine.append({
                        "raw": row_combined,
                        "cells": row_text
                    })

    # Strategy 2: Look for structured schedule elements
    # RWTHonline uses Angular components for schedule display
    date_patterns = [
        r'(Mo|Di|Mi|Do|Fr|Sa|So)\.\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})',
        r'(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})',
    ]
    
    page_text = soup.get_text()
    for pattern in date_patterns:
        matches = re.finditer(pattern, page_text)
        for match in matches:
            day = match.group(1)
            start_time = match.group(2)
            end_time = match.group(3)
            
            # Try to extract room and date range from context
            context_start = max(0, match.start() - 50)
            context_end = min(len(page_text), match.end() + 100)
            context = page_text[context_start:context_end]
            
            termin = {
                "tag": day,
                "von": start_time,
                "bis": end_time,
                "raw": context.strip()
            }
            
            # Try to find room
            room_match = re.search(r'((?:Hörsaal|Raum|Audimax|AH\s|HKW|Temp|SeMath)\s*[\w\s\-/\.]+)', context)
            if room_match:
                termin["raum"] = room_match.group(1).strip()
            
            # Check for duplicates
            is_dup = False
            for existing in termine:
                if (existing.get("tag") == day and 
                    existing.get("von") == start_time and
                    existing.get("bis") == end_time):
                    is_dup = True
                    break
            if not is_dup:
                termine.append(termin)

    # Strategy 3: Use Selenium to find schedule elements directly
    if not termine:
        try:
            # Try various selectors that RWTHonline might use
            selectors = [
                "tm-course-dates",
                "tm-group-dates",
                ".course-dates",
                "[class*='date']",
                "[class*='schedule']",
                "[class*='termin']",
            ]
            for selector in selectors:
                try:
                    elements = driver.find_elements(By.CSS_SELECTOR, selector)
                    for el in elements:
                        text = el.text.strip()
                        if text and len(text) > 5:
                            # Parse the text for schedule info
                            lines = text.split("\n")
                            for line in lines:
                                line = line.strip()
                                for pattern in date_patterns:
                                    match = re.search(pattern, line)
                                    if match:
                                        termine.append({
                                            "tag": match.group(1),
                                            "von": match.group(2),
                                            "bis": match.group(3),
                                            "raw": line
                                        })
                except Exception:
                    continue
        except Exception:
            pass

    # Strategy 4: Find all text blocks that contain time patterns
    if not termine:
        try:
            all_elements = driver.find_elements(By.XPATH, "//*[contains(text(), ':')]")
            for el in all_elements:
                text = el.text.strip()
                if not text or len(text) > 300:
                    continue
                # Look for time patterns like "10:00 - 12:00" or "10:00-12:00"
                time_match = re.search(
                    r'(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})', text
                )
                if time_match:
                    # Check if a day is also present
                    day_match = re.search(
                        r'(Mo|Di|Mi|Do|Fr|Sa|So|Montag|Dienstag|Mittwoch|Donnerstag|Freitag)', 
                        text
                    )
                    if day_match:
                        termin = {
                            "tag": day_match.group(1),
                            "von": time_match.group(1),
                            "bis": time_match.group(2),
                            "raw": text
                        }
                        # Dedup check
                        is_dup = any(
                            t.get("tag") == termin["tag"] and 
                            t.get("von") == termin["von"] and
                            t.get("bis") == termin["bis"]
                            for t in termine
                        )
                        if not is_dup:
                            termine.append(termin)
        except Exception:
            pass

    return termine


def fetch_all_details(driver, courses: list, progress_file: str = None):
    """
    Visit each course detail page and extract Lehrstuhl + Termine.
    Saves progress periodically.
    """
    total = len(courses)
    progress = {}

    if progress_file and os.path.exists(progress_file):
        try:
            with open(progress_file, "r") as f:
                progress = json.load(f)
            print(f"  📂 Fortschritt geladen: {len(progress)} Kurse bereits verarbeitet.")
        except Exception:
            progress = {}

    for i, course in enumerate(courses):
        link = course.get("Link", "")
        key = course.get("LV-Nr", "") + "|" + course.get("Fachname", "")

        # Skip if already processed
        if key in progress:
            course["Lehrstuhl"] = progress[key].get("Lehrstuhl", "")
            course["Termine"] = progress[key].get("Termine", [])
            continue

        print(f"  [{i+1}/{total}] {course.get('Fachname', '')[:60]}...", end=" ", flush=True)

        detail = extract_course_detail(driver, link)
        course["Lehrstuhl"] = detail["Lehrstuhl"]
        course["Termine"] = detail["Termine"]
        
        progress[key] = {
            "Lehrstuhl": detail["Lehrstuhl"],
            "Termine": detail["Termine"]
        }

        ls_status = "✅" if detail["Lehrstuhl"] and not detail["Lehrstuhl"].startswith("(") else "⚠️"
        t_count = len(detail["Termine"])
        print(f"{ls_status} LS={detail['Lehrstuhl'][:40] if detail['Lehrstuhl'] else '?'} | {t_count} Termine")

        # Save progress every 5 courses
        if progress_file and (i + 1) % 5 == 0:
            with open(progress_file, "w") as f:
                json.dump(progress, f, ensure_ascii=False, indent=2)

        time.sleep(0.5)

    # Final progress save
    if progress_file:
        with open(progress_file, "w") as f:
            json.dump(progress, f, ensure_ascii=False, indent=2)


# ─────────────────────────────────────────────────────────────
# STEP 3: Save to CSV and JSON
# ─────────────────────────────────────────────────────────────

def save_to_csv(courses: list, output_path: str):
    """Save extracted course data to CSV."""
    fieldnames = ["LV-Nr", "Fachname", "Typ", "Vortragende", "Lehrstuhl", "Termine", "Link"]

    with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";",
                                quoting=csv.QUOTE_ALL)
        writer.writeheader()
        for course in courses:
            row = {fn: course.get(fn, "") for fn in fieldnames}
            # Serialize Termine as compact string for CSV
            if isinstance(row["Termine"], list):
                termine_strs = []
                for t in row["Termine"]:
                    if isinstance(t, dict):
                        tag = t.get("tag", "")
                        von = t.get("von", "")
                        bis = t.get("bis", "")
                        raum = t.get("raum", "")
                        s = f"{tag} {von}-{bis}"
                        if raum:
                            s += f" ({raum})"
                        termine_strs.append(s)
                    else:
                        termine_strs.append(str(t))
                row["Termine"] = " | ".join(termine_strs)
            writer.writerow(row)

    print(f"\n  ✅ CSV gespeichert: {output_path}")
    print(f"     {len(courses)} Kurse geschrieben.")


def save_to_json(courses: list, output_path: str):
    """Save extracted course data to JSON (for the web planner tool)."""
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(courses, f, ensure_ascii=False, indent=2)
    print(f"  ✅ JSON gespeichert: {output_path}")


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_csv = os.path.join(script_dir, "kurse_rwth.csv")
    output_json = os.path.join(script_dir, "kurse_rwth.json")
    progress_file = os.path.join(script_dir, ".scrape_progress.json")

    print("=" * 65)
    print("  RWTH Kurs-Scraper (mit Selenium + Terminextraktion)")
    print("=" * 65)

    # ── Step 1: Parse HTML files ──
    print("\n📋 SCHRITT 1: HTML-Dateien parsen...")
    courses = parse_html_files(script_dir)

    if not courses:
        print("Keine Kurse gefunden. Abbruch.")
        return

    # ── Step 2: Selenium for Lehrstuhl + Termine ──
    print("\n🌐 SCHRITT 2: Selenium starten...")
    driver = None

    try:
        driver = create_driver()
        print("  ✅ Chrome gestartet.")

        if not wait_for_login(driver):
            print("  Abbruch wegen Login-Fehler.")
            return

        print(f"\n🔍 SCHRITT 3: Lehrstuhl + Termine extrahieren ({len(courses)} Kurse)...")
        print("   (Fortschritt wird automatisch gespeichert)\n")

        fetch_all_details(driver, courses, progress_file)

    except KeyboardInterrupt:
        print("\n\n  ⚠️  Abgebrochen! Bisheriger Fortschritt wird gespeichert...")
    except Exception as e:
        print(f"\n  ❌ Fehler: {e}")
        print("     Bisheriger Fortschritt wird gespeichert...")
    finally:
        # ── Step 3: Save results ──
        print("\n💾 Ergebnisse speichern...")
        save_to_csv(courses, output_csv)
        save_to_json(courses, output_json)

        if driver:
            try:
                driver.quit()
            except Exception:
                pass

    # Stats
    with_lehrstuhl = sum(1 for c in courses
                         if c.get("Lehrstuhl") and not c["Lehrstuhl"].startswith("("))
    with_termine = sum(1 for c in courses if c.get("Termine"))
    print(f"\n  📊 Statistik:")
    print(f"     {with_lehrstuhl}/{len(courses)} mit Lehrstuhl")
    print(f"     {with_termine}/{len(courses)} mit Terminen")

    # Clean up progress file on full completion
    all_done = all(c.get("Lehrstuhl") is not None for c in courses)
    if all_done and os.path.exists(progress_file):
        os.remove(progress_file)
        print("  🧹 Fortschritts-Datei aufgeräumt.")

    print("\n" + "=" * 65)
    print("  Fertig! Dateien: kurse_rwth.csv + kurse_rwth.json")
    print("=" * 65)


if __name__ == "__main__":
    main()
