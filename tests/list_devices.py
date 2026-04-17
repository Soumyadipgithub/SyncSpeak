import sounddevice as sd

devs = sd.query_devices()
hostapis = sd.query_hostapis()

with open("devices_list.txt", "w", encoding="utf-8") as f:
    f.write("ALL Audio Devices (showing all host APIs):\n")
    f.write("=" * 80 + "\n\n")
    
    # Find Bluetooth devices specifically
    f.write("BLUETOOTH DEVICES:\n")
    f.write("-" * 70 + "\n")
    for i, d in enumerate(devs):
        name_lower = d["name"].lower()
        ha = hostapis[d["hostapi"]]["name"]
        if any(kw in name_lower for kw in ["bluetooth", "buds", "oneplus", "headset", "bt", "hands-free"]):
            io = ""
            if d["max_input_channels"] > 0:
                io += "IN"
            if d["max_output_channels"] > 0:
                io += "/OUT" if io else "OUT"
            f.write(f"  [{i:>2}] {io:>6}  {d['name']}  ({ha})\n")
    
    f.write("\nPHYSICAL (NON-BLUETOOTH) DEVICES:\n")
    f.write("-" * 70 + "\n")
    for i, d in enumerate(devs):
        name_lower = d["name"].lower()
        ha = hostapis[d["hostapi"]]["name"]
        if "voicemeeter" in name_lower:
            continue
        if any(kw in name_lower for kw in ["bluetooth", "buds", "oneplus", "headset", "bt", "hands-free"]):
            continue
        io = ""
        if d["max_input_channels"] > 0:
            io += "IN"
        if d["max_output_channels"] > 0:
            io += "/OUT" if io else "OUT"
        f.write(f"  [{i:>2}] {io:>6}  {d['name']}  ({ha})\n")
    
    f.write("\nVOICEMEETER VIRTUAL DEVICES (WASAPI only):\n")
    f.write("-" * 70 + "\n")
    for i, d in enumerate(devs):
        ha = hostapis[d["hostapi"]]["name"]
        if "voicemeeter" not in d["name"].lower():
            continue
        if "WASAPI" not in ha:
            continue
        io = ""
        if d["max_input_channels"] > 0:
            io += "IN"
        if d["max_output_channels"] > 0:
            io += "/OUT" if io else "OUT"
        f.write(f"  [{i:>2}] {io:>6}  {d['name']}\n")

print("Done - check devices_list.txt")
