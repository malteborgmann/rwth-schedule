# 1. Daten extrahieren (einmalig)
python3 extract_courses.py

# 2. Server starten
cd planner && python3 -m http.server 8080

# 3. Im Browser öffnen
open http://localhost:8080
