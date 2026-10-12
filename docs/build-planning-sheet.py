#!/usr/bin/env python3
"""Build the editable planning workbook with Python's stdlib and LibreOffice.

python docs/build-planning-sheet.py --work-dir /path/to/workspace/temp/sheet --check
"""

import argparse
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
from zipfile import ZipFile


NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "style": "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "fo": "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
    "number": "urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0",
    "of": "urn:oasis:names:tc:opendocument:xmlns:of:1.2",
}
for prefix, uri in NS.items():
    ET.register_namespace(prefix, uri)


def el(parent, name, attrs=None, text=None):
    def q(key):
        prefix, local = key.split(":")
        return f"{{{NS[prefix]}}}{local}"
    node = ET.SubElement(parent, q(name), {q(k): str(v) for k, v in (attrs or {}).items()})
    node.text = text
    return node


def document(path, example=False, conflict=False):
    root = ET.Element(f"{{{NS['office']}}}document", {
        f"{{{NS['office']}}}version": "1.3",
        f"{{{NS['office']}}}mimetype": "application/vnd.oasis.opendocument.spreadsheet",
        "xmlns:of": NS["of"],
    })
    styles = el(root, "office:automatic-styles")
    money = el(styles, "number:number-style", {"style:name": "money"})
    el(money, "number:number", {"number:decimal-places": 2, "number:min-integer-digits": 1})
    for name, bg, fg, size, bold in [
        ("plain", "#fffefa", "#203e49", 10, False),
        ("title", "#203e49", "#fffefa", 20, True),
        ("head", "#203e49", "#fffefa", 10, True),
        ("input", "#fff1ce", "#203e49", 10, False),
        ("calc", "#e8eee4", "#203e49", 10, False),
        ("cash", "#e8eee4", "#203e49", 10, False),
        ("note", "#fffefa", "#5d716d", 10, False),
    ]:
        attrs = {"style:name": name, "style:family": "table-cell"}
        if name == "cash":
            attrs["style:data-style-name"] = "money"
        s = el(styles, "style:style", attrs)
        el(s, "style:table-cell-properties", {"fo:background-color": bg,
            "fo:padding": "0.12cm", "fo:wrap-option": "wrap", "style:vertical-align": "middle",
            "fo:border": "0.3pt solid #d6dacd" if name in ("input", "calc", "cash") else "none"})
        el(s, "style:text-properties", {"fo:font-family": "Liberation Sans", "fo:font-size": f"{size}pt",
            "fo:color": fg, "fo:font-weight": "bold" if bold else "normal"})
    page = el(styles, "style:page-layout", {"style:name": "page"})
    el(page, "style:page-layout-properties", {"fo:page-width": "29.7cm", "fo:page-height": "21cm",
        "style:print-orientation": "landscape", "fo:margin": "1cm",
        "style:scale-to-X": 1, "style:scale-to-Y": 1})
    table_style = el(styles, "style:style", {"style:name": "sheet", "style:family": "table",
        "style:master-page-name": "default"})
    el(table_style, "style:table-properties", {"table:display": "true"})
    masters = el(root, "office:master-styles")
    el(masters, "style:master-page", {"style:name": "default", "style:page-layout-name": "page"})
    body = el(root, "office:body")
    book = el(body, "office:spreadsheet")

    def sheet(name, widths=(2.5, 1.5, 2.3, 1.5, 1.5, 1.7, 2.0, 5.2, 6.2, 4.1)):
        table = el(book, "table:table", {"table:name": name, "table:style-name": "sheet"})
        for i, width in enumerate(widths):
            ident = f"sheet{len(book)}col{i}"
            s = el(styles, "style:style", {"style:name": ident, "style:family": "table-column"})
            el(s, "style:table-column-properties", {"style:column-width": f"{width}cm"})
            el(table, "table:table-column", {"table:style-name": ident})
        return table

    def row(table, values, styles=None):
        r = el(table, "table:table-row")
        for i, value in enumerate(values):
            attrs = {"table:style-name": (styles or {}).get(i, "plain")}
            if isinstance(value, tuple):
                value, span = value
                attrs["table:number-columns-spanned"] = span
            else:
                span = 1
            if isinstance(value, (int, float)):
                attrs.update({"office:value-type": "float", "office:value": value})
            elif isinstance(value, str) and value.startswith("of:="):
                attrs.update({"table:formula": value, "office:value-type": "float", "office:value": 0})
            else:
                attrs["office:value-type"] = "string"
            c = el(r, "table:table-cell", attrs)
            if value != "":
                el(c, "text:p", text=str(value) if not str(value).startswith("of:=") else "")
            for _ in range(span - 1):
                el(r, "table:covered-table-cell")

    setup = sheet("Start here")
    row(setup, [("Raincheck / cancellation planner", 10)], {0: "title"})
    row(setup, [("One cancelled class. A clear plan for every booking.", 10)])
    row(setup, [("Gold cells are yours to edit. Green cells calculate from your plan. Start with a fresh copy for each class.", 10)], {0: "note"})
    row(setup, ["Class", ("Replace with your cancelled class", 9)], {1: "input"})
    row(setup, ["Ticket USD", 68, ("Set the original USD price per ticket, to two decimal places. All tickets in this batch share this price.", 8)], {1: "input", 2: "note"})
    row(setup, [("1. Add replacement sessions", 10)], {0: "head"})
    row(setup, [("On Sessions, give each option a unique ID such as SUN18 and enter its date/time and seats available before this batch.", 10)])
    row(setup, [("2. Plan each booking", 10)], {0: "head"})
    row(setup, [("On Bookings, enter up to 30 booking IDs and whole ticket counts. A booking can split between one replacement session and full-ticket refunds. Use simple alphanumeric IDs.", 10)])
    row(setup, [("3. Resolve the open questions", 10)], {0: "head"})
    row(setup, [("Read every Row check. All proposed moves count against session capacity. If two guests request the last place, agree an alternative before approving either plan.", 10)])
    row(setup, [("4. Confirm, act, record", 10)], {0: "head"})
    row(setup, [("Confirm each guest's choice and the actual seats in your booking system. Send messages, move tickets and refund the original payments in your own tools. Add the refund receipt after the provider records success.", 10)])
    row(setup, [("Planning totals", 10)], {0: "head"})
    row(setup, ["Bookings", "of:=COUNTA([Bookings.A7:A36])", ("A planning sheet stays editable throughout the cancellation.", 8)], {1: "calc"})
    row(setup, ["To decide", "of:=SUM([Bookings.F7:F36])", ("Unallocated tickets still need a guest's choice. A negative count asks you to repair the seat split.", 8)], {1: "calc"})
    row(setup, ["Refund USD", "of:=SUM([Bookings.G7:G36])", ("Planned full-ticket refunds. Provider receipt references record actual refunds separately.", 8)], {1: "cash"})
    row(setup, [("Need the plan prepared for you? US$29 / one batch / up to 30 bookings.", 10)], {0: "head"})
    row(setup, [("Email belgialucca@gmail.com with your booking count, booking tool and target date. We agree a scope, price and delivery date, then prepare the plan, questions and guest-message drafts within two business days. One revision included.", 10)])
    row(setup, [("Use booking aliases and redacted replies for the assisted service. Keep names, email addresses and payment access in your own systems. Your original records supply the final payment and availability checks.", 10)], {0: "note"})
    row(setup, [("Worked example: B001 bought 2 tickets at $68. Move 1 to SUN18; refund 1. The plan uses 1 place and shows $68 back. A second move to SUN18 when its starting capacity is 1 flags both rows for review.", 10)])
    row(setup, [("https://blucca.github.io/raincheck/public/demo.html#pilot | MIT | Prepared with AI-agent engineering", 10)], {0: "note"})

    bookings = sheet("Bookings")
    row(bookings, [("Bookings / plan each guest's next step", 10)], {0: "title"})
    row(bookings, [("Gold = input. Green = calculated. Keep formulas in columns F, G and H when replacing your entries.", 10)], {0: "note"})
    row(bookings, [("A plan becomes ready for review when every ticket has a next step and the selected session has room.", 10)])
    row(bookings, [("The operator sends the messages and completes payment and booking changes in the original tools.", 10)])
    row(bookings, [("For an unanswered guest, enter Seats bought and keep Move / Refund empty. Record the question in Follow-up.", 10)])
    row(bookings, ["Booking ref", "Seats bought", "Move to slot", "Move seats", "Refund seats", "To decide", "Refund USD", "Row check", "Guest reply / follow-up", "Refund receipt"], dict.fromkeys(range(10), "head"))
    examples = [
        ["B001", 2, "SUN18", 1, 1, "My sister can attend Sunday. Please refund my ticket."],
        ["B002", 1, "", 0, 1, "A full refund, please."],
        ["B003", 2, "SAT24", 2, 0, "Both of us can come next Saturday."],
        ["B004", 1, "SUN18" if conflict else "", 1 if conflict else "", 0 if conflict else "", "Sunday works." if conflict else "Which times are available?"],
    ]
    for n in range(7, 37):
        a, b, c, d, e, reply = examples[n - 7] if example and n < 11 else [""] * 6
        check = (
            f'IF([.A{n}]="";"";IFERROR('
            f'IF(COUNTIF([.A$7:.A$36];[.A{n}])<>1;"Use a unique booking ref";'
            f'IF(OR(NOT(ISNUMBER([\'Start here\'.B5]));[\'Start here\'.B5]<=0;ROUND([\'Start here\'.B5];2)<>[\'Start here\'.B5]);"Check ticket price";'
            f'IF(OR(NOT(ISNUMBER([.B{n}]));[.B{n}]<1;INT([.B{n}])<>[.B{n}]);"Check seats bought";'
            f'IF(OR([.D{n}]<0;[.E{n}]<0;INT([.D{n}])<>[.D{n}];INT([.E{n}])<>[.E{n}]);"Use whole seat counts";'
            f'IF([.D{n}]+[.E{n}]>[.B{n}];"Reduce allocated seats";'
            f'IF([.F{n}]>0;"Ask guest about "&[.F{n}]&" seat(s)";'
            f'IF(AND([.D{n}]>0;COUNTIF([Sessions.A$7:A$14];[.C{n}])<>1);"Choose one slot ref";'
            f'IF(AND([.D{n}]=0;[.C{n}]<>"");"Clear unused slot";'
            f'IF(AND([.D{n}]>0;IFERROR(VLOOKUP([.C{n}];[Sessions.A$7:F$14];6;0);"")<>"Capacity clear");'
            '"Resolve slot capacity";"Ready for review")))))))));"Check seat values"))'
        )
        row(bookings, [a, b, c, d, e,
            f'of:=IF([.A{n}]="";"";IFERROR([.B{n}]-[.D{n}]-[.E{n}];""))',
            f'of:=IF([.A{n}]="";"";IFERROR(ROUND([.E{n}]*[\'Start here\'.B5];2);""))',
            "of:=" + check, reply, ""], {**dict.fromkeys(range(10), "input"), 5: "calc", 6: "cash", 7: "calc"})

    sessions = sheet("Sessions", (3, 6, 3, 3, 3, 7))
    row(sessions, [("Sessions / make room for the whole class", 6)], {0: "title"})
    row(sessions, [("Enter up to eight replacement sessions. Use one unique slot ID per session, such as SUN18.", 6)])
    row(sessions, [("Available seats means space remaining before this cancellation batch. All proposed moves on Bookings consume this space.", 6)])
    row(sessions, [("Gold = input. Green = calculated. Keep formulas in columns D, E and F.", 6)], {0: "note"})
    row(sessions, [("Refresh starting availability from your booking system before confirming plans.", 6)])
    row(sessions, ["Slot ref", "Date / time", "Available seats", "Planned moves", "Places left", "Capacity check"], dict.fromkeys(range(6), "head"))
    for n in range(7, 15):
        sample = ["SUN18", "18 Oct, 2 pm", 1] if n == 7 else ["SAT24", "24 Oct, 2 pm", 4]
        values = sample if example and n < 9 else ["", "", ""]
        row(sessions, [*values,
            f'of:=IF([.A{n}]="";"";SUMIF([Bookings.C7:C36];[.A{n}];[Bookings.D7:D36]))',
            f'of:=IF([.A{n}]="";"";IFERROR([.C{n}]-[.D{n}];""))',
            f'of:=IF([.A{n}]="";"";IFERROR(IF(COUNTIF([.A$7:.A$14];[.A{n}])<>1;"Use unique slot ref";IF([.B{n}]="";"Add date/time";IF(OR(NOT(ISNUMBER([.C{n}]));[.C{n}]<0;INT([.C{n}])<>[.C{n}]);"Check available seats";IF([.E{n}]<0;"Over capacity by "&ABS([.E{n}]);"Capacity clear"))));"Check available seats"))'],
            {0: "input", 1: "input", 2: "input", 3: "calc", 4: "calc", 5: "calc"})
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)


def convert(source, work):
    subprocess.run(["libreoffice", "--headless", f"-env:UserInstallation={(work / 'lo-profile').as_uri()}",
        "--convert-to", "xlsx", "--outdir", str(work), str(source)], check=True, timeout=90,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    target = work / (source.stem + ".xlsx")
    if not target.exists():
        raise RuntimeError("Workbook conversion failed")
    return target


def values(path, sheet):
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with ZipFile(path) as z:
        strings = ["".join(x.itertext()) for x in ET.fromstring(z.read("xl/sharedStrings.xml"))]
        cells = ET.fromstring(z.read(f"xl/worksheets/sheet{sheet}.xml"))
        result = {}
        for c in cells.findall(".//s:c", ns):
            v = c.find("s:v", ns)
            if v is not None:
                result[c.attrib["r"]] = strings[int(v.text)] if c.get("t") == "s" else v.text
        return result


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--work-dir", type=Path, required=True)
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    work = args.work_dir.resolve()
    work.mkdir(parents=True, exist_ok=True)
    source = work / "raincheck-planning-sheet.fods"
    document(source)
    output = Path(__file__).resolve().parents[1] / "public" / "raincheck-planning-sheet.xlsx"
    output.write_bytes(convert(source, work).read_bytes())
    if args.check:
        for conflict in (False, True):
            source = work / f"example-{int(conflict)}.fods"
            document(source, example=True, conflict=conflict)
            path = convert(source, work)
            setup, bookings, sessions = (values(path, i) for i in (1, 2, 3))
            assert setup["B15"] == "4" and setup["B17"] == "136", setup
            assert bookings["G7"] == "68" and bookings["G8"] == "68", bookings
            if conflict:
                assert sessions["E7"] == "-1" and sessions["F7"] == "Over capacity by 1", sessions
                assert bookings["H7"] == bookings["H10"] == "Resolve slot capacity", bookings
            else:
                assert bookings["H7"] == bookings["H8"] == bookings["H9"] == "Ready for review", bookings
                assert bookings["H10"] == "Ask guest about 1 seat(s)", bookings
                assert sessions["E7"] == "0" and sessions["E8"] == "2", sessions
        print("Checked: split refund, whole refund, transfer, open question, shared last-seat conflict.")
    print(output)


if __name__ == "__main__":
    main()
