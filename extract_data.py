from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

import openpyxl


ROOT = Path(__file__).resolve().parent
WB_PATH = ROOT / "ES.xlsx"
OUT_PATH = ROOT / "data.js"


def s(v):
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.date().isoformat()
    return str(v).strip()


def num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    t = re.sub(r"[^0-9.\-]", "", str(v))
    return float(t) if t else None


def iso(v):
    if isinstance(v, datetime):
        return v.date().isoformat()
    return s(v)


def rows(ws):
    for r in ws.iter_rows(min_row=2, values_only=True):
        if any(v not in (None, "") for v in r):
            yield r


wb = openpyxl.load_workbook(WB_PATH, data_only=True)
seed = {
    "ekadashiDates": [iso(r[1]) for r in rows(wb["Ekadashi Dates"]) if r[1]],
    "donors": [],
    "payments": [],
}

for r in rows(wb["ES"]):
    seed["donors"].append(
        {
            "registrationDate": iso(r[0]),
            "name": s(r[1]),
            "introducedBy": s(r[2]),
            "pledgeText": s(r[3]),
            "whatsappNumber": s(r[4]),
            "email": s(r[5]),
            "address": s(r[6]),
            "nakshatra": s(r[7]),
            "gotra": s(r[8]),
            "birthDate": iso(r[9]),
            "plateNames": s(r[10]),
            "remarks": s(r[11]),
            "connectedToMNS": s(r[12]),
            "sevaka": s(r[13]),
            "center": s(r[14]),
            "pledgeValue": num(r[15]) or 0,
            "copperInscription": s(r[16]),
            "autoDebit": s(r[17]),
            "birthdayPujaStatus": s(r[18]),
            "donorId": s(r[19]),
            "ekadashisElapsed": num(r[20]) or 0,
            "key": s(r[19]) or f"{s(r[1]).lower()}-{s(r[4])}-{s(r[5]).lower()}",
        }
    )

for sheet, source in [("Razorpay", "Shopify"), ("Eazbuzz", "Easebuzz"), ("Other Sources VSTACK", "Other")]:
    ws = wb[sheet]
    for r in rows(ws):
        seed["payments"].append(
            {
                "sourceGroup": source,
                "sourceRaw": sheet,
                "paymentDate": iso(r[0 if sheet != "Other Sources VSTACK" else 4]),
                "amountPaid": num(r[1 if sheet != "Other Sources VSTACK" else 5]) or 0,
                "paymentMode": s(r[2 if sheet != "Other Sources VSTACK" else 6]),
                "name": s(r[8 if sheet != "Other Sources VSTACK" else 0]),
                "whatsappNumber": s(r[9 if sheet != "Other Sources VSTACK" else 1]),
                "email": s(r[10 if sheet != "Other Sources VSTACK" else 2]),
                "pledgeValue": num(r[11 if sheet != "Other Sources VSTACK" else 3]) or 0,
                "donorId": s(r[6 if sheet != "Other Sources VSTACK" else 7]),
                "key": s(r[6 if sheet != "Other Sources VSTACK" else 7]),
                "manual": False,
            }
        )

OUT_PATH.write_text("window.ES_SEED=" + json.dumps(seed, ensure_ascii=False, separators=(",", ":")) + ";")
