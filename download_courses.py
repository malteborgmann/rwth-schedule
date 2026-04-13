#!/usr/bin/env python3
"""
Download all RWTH course detail pages as HTML files.

1) Parses locally saved HTML list files (HTML1.html, HTML2.html, ...) to extract course links.
2) Uses Selenium to login and visit each course detail page.
3) Clicks on "Termine und Gruppen" to load the schedule section.
4) Saves the fully-rendered HTML page source into the Course_Pages/ folder.

Usage:
    python3 download_courses.py

Output:
    Course_Pages/<LV-Nr>_<sanitized_name>.html   (one file per course)

The script supports resuming: already downloaded pages are skipped.
Press Ctrl+C to stop — you can safely restart and it will continue.
"""

import os
import re
import time
import glob
import json
from bs4 import BeautifulSoup

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException


# ─────────────────────────────────────────────────────────────
# STEP 1: Parse local HTML files for course links
# ─────────────────────────────────────────────────────────────

def parse_html_files(directory: str) -> list:
    """Parse all HTML list files and extract course data (name, LV-Nr, link)."""
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

            if course.get("Fachname") and course.get("Link"):
                courses.append(course)

    # Deduplicate by LV-Nr + Fachname
    seen = set()
    unique_courses = []
    for c in courses:
        key = c.get("LV-Nr", "") + "|" + c.get("Fachname", "")
        if key not in seen:
            seen.add(key)
            unique_courses.append(c)

    print(f"\n  → {len(unique_courses)} einzigartige Kurse mit Links gefunden.")
    return unique_courses


# ─────────────────────────────────────────────────────────────
# STEP 2: Selenium – Login
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
        print("  ✅ Login erkannt!\n")
        time.sleep(2)
        return True
    except TimeoutException:
        print("  ❌ Login-Timeout! Bitte starte das Script erneut.")
        return False


# ─────────────────────────────────────────────────────────────
# STEP 3: Download each course page
# ─────────────────────────────────────────────────────────────

def sanitize_filename(name: str) -> str:
    """Convert a course name into a safe filename."""
    # Replace problematic characters
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    name = re.sub(r'[\s]+', '_', name)
    name = re.sub(r'_+', '_', name)
    name = name.strip('_.')
    # Limit length
    if len(name) > 80:
        name = name[:80].rstrip('_')
    return name


def download_course_page(driver, course: dict, output_dir: str, timeout: int = 15) -> bool:
    """
    Visit a course detail page, click on "Termine und Gruppen" to load
    the schedule, then save the full page HTML.
    
    Returns True on success, False on failure.
    """
    link = course.get("Link", "")
    if not link:
        return False

    try:
        driver.get(link)

        # Wait for the detail page to load
        WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, "ca-page, .ca-page-content, .pageContent")
            )
        )
        # Let Angular fully render the overview section
        time.sleep(2)

        # Click on "Termine und Gruppen" to load the schedule section
        try:
            termine_link = driver.find_element(
                By.XPATH,
                "//li[contains(@aria-label, 'Termine')]//a | "
                "//a[contains(text(), 'Termine')]"
            )
            termine_link.click()
            # Wait for the Termine section to render
            time.sleep(3)
        except (NoSuchElementException, Exception):
            # Section might not exist or already visible — that's OK
            pass

        # Grab the full page source after everything is loaded
        page_source = driver.page_source

        # Build filename
        lv_nr = course.get("LV-Nr", "unknown").replace(".", "-")
        name = sanitize_filename(course.get("Fachname", "unknown"))
        filename = f"{lv_nr}_{name}.html"
        filepath = os.path.join(output_dir, filename)

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(page_source)

        return True

    except TimeoutException:
        return False
    except Exception as e:
        print(f"(Fehler: {str(e)[:60]})", end=" ")
        return False


def download_all_courses(driver, courses: list, output_dir: str):
    """
    Download all course detail pages.
    Skips courses that have already been downloaded (resume support).
    """
    total = len(courses)
    downloaded = 0
    skipped = 0
    failed = 0

    # Get list of already downloaded files for resume support
    existing_files = set()
    if os.path.exists(output_dir):
        for f in os.listdir(output_dir):
            if f.endswith(".html"):
                existing_files.add(f)

    for i, course in enumerate(courses):
        lv_nr = course.get("LV-Nr", "unknown").replace(".", "-")
        name = sanitize_filename(course.get("Fachname", "unknown"))
        expected_filename = f"{lv_nr}_{name}.html"

        # Skip if already downloaded
        if expected_filename in existing_files:
            skipped += 1
            continue

        fachname = course.get("Fachname", "")[:55]
        print(f"  [{i+1}/{total}] {fachname}...", end=" ", flush=True)

        success = download_course_page(driver, course, output_dir)

        if success:
            downloaded += 1
            print("✅")
        else:
            failed += 1
            print("❌")

        # Small delay to be nice to the server
        time.sleep(0.5)

    return downloaded, skipped, failed


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, "Course_Pages")

    print("=" * 65)
    print("  RWTH Kursseiten-Downloader (Selenium)")
    print("=" * 65)

    # ── Step 1: Parse HTML files for course links ──
    print("\n📋 SCHRITT 1: Kurslisten parsen...")
    courses = parse_html_files(script_dir)

    if not courses:
        print("Keine Kurse gefunden. Abbruch.")
        return

    # ── Create output directory ──
    os.makedirs(output_dir, exist_ok=True)
    print(f"\n📁 Ausgabe-Ordner: {output_dir}")

    # Check how many are already downloaded
    existing = [f for f in os.listdir(output_dir) if f.endswith(".html")]
    if existing:
        print(f"   {len(existing)} Seiten bereits vorhanden (werden übersprungen)")

    # ── Step 2: Selenium login ──
    print("\n🌐 SCHRITT 2: Selenium starten...")
    driver = None

    try:
        driver = create_driver()
        print("  ✅ Chrome gestartet.")

        if not wait_for_login(driver):
            print("  Abbruch wegen Login-Fehler.")
            return

        # ── Step 3: Download all pages ──
        print(f"\n📥 SCHRITT 3: Kursseiten herunterladen ({len(courses)} Kurse)...")
        print("   (Bereits heruntergeladene werden übersprungen)")
        print("   (Ctrl+C zum Abbrechen — Fortschritt bleibt erhalten)\n")

        downloaded, skipped, failed = download_all_courses(driver, courses, output_dir)

    except KeyboardInterrupt:
        print("\n\n  ⚠️  Abgebrochen! Bisherige Downloads bleiben erhalten.")
        print("     Starte das Script erneut, um fortzufahren.")
        downloaded = skipped = failed = 0  # Stats not accurate after interrupt
    except Exception as e:
        print(f"\n  ❌ Fehler: {e}")
        downloaded = skipped = failed = 0
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass

    # ── Final stats ──
    final_count = len([f for f in os.listdir(output_dir) if f.endswith(".html")])
    print(f"\n{'=' * 65}")
    print(f"  📊 Ergebnis:")
    print(f"     {final_count}/{len(courses)} Kursseiten im Ordner Course_Pages/")
    if downloaded:
        print(f"     {downloaded} neu heruntergeladen")
    if skipped:
        print(f"     {skipped} übersprungen (bereits vorhanden)")
    if failed:
        print(f"     {failed} fehlgeschlagen")
    print(f"{'=' * 65}")


if __name__ == "__main__":
    main()
