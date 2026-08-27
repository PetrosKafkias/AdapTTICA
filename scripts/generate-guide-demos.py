"""Generate small, readable User Guide demos from real AdapTTICA screenshots."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
GUIDE = ROOT / "public" / "guide"
OUTPUT_WIDTH = 960


DEMOS = {
    "create-case-study": {
        "source": "cases",
        "path": [(180, 160), (430, 160), (760, 160), (1120, 190)],
        "el": ("Δημιουργία μελέτης περίπτωσης", "Επιλέξτε «Νέα μελέτη περίπτωσης»."),
        "en": ("Create a case study", "Select “New case study”."),
    },
    "toolkit-template": {
        "source": "toolkit",
        "path": [(1080, 200), (850, 400), (600, 520), (390, 560)],
        "el": ("Χρήση προτύπου", "Επιλέξτε το κατάλληλο πρότυπο συνεργασίας."),
        "en": ("Use a template", "Choose the appropriate collaboration template."),
    },
    "invite-participant": {
        "source": "case",
        "path": [(240, 180), (650, 190), (930, 190), (1110, 190)],
        "el": ("Πρόσκληση συμμετέχοντα", "Ανοίξτε την πρόσκληση και ορίστε τον ρόλο."),
        "en": ("Invite a participant", "Open the invitation and assign a role."),
    },
    "publish-output": {
        "source": "case",
        "path": [(260, 470), (560, 450), (900, 360), (1110, 320)],
        "el": ("Ανάρτηση αποτελέσματος", "Προσθέστε το αποτέλεσμα και τα συνοδευτικά στοιχεία."),
        "en": ("Publish an output", "Add the output and its supporting material."),
    },
    "review-output": {
        "source": "case",
        "path": [(1030, 720), (860, 650), (640, 590), (420, 530)],
        "el": ("Υποβολή για έγκριση", "Ελέγξτε την κατάσταση και καταγράψτε την απόφαση."),
        "en": ("Submit for approval", "Review the status and record the decision."),
    },
}


def font(size: int, bold: bool = False):
    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def cursor(draw: ImageDraw.ImageDraw, x: int, y: int, pressed: bool):
    if pressed:
        draw.ellipse((x - 23, y - 23, x + 23, y + 23), fill=(84, 215, 232, 72), outline=(8, 78, 116, 220), width=3)
    points = [(x, y), (x + 4, y + 29), (x + 12, y + 21), (x + 21, y + 37), (x + 29, y + 32), (x + 19, y + 17), (x + 31, y + 14)]
    draw.polygon(points, fill="white", outline="#083860")


def make_demo(name: str, spec: dict, lang: str):
    suffix = "-en" if lang == "en" else ""
    source = Image.open(GUIDE / f"{spec['source']}{suffix}.png").convert("RGB")
    scale = OUTPUT_WIDTH / source.width
    source = source.resize((OUTPUT_WIDTH, round(source.height * scale)), Image.Resampling.LANCZOS)
    title, helper = spec[lang]
    scaled_path = [(round(x * scale), round(y * scale)) for x, y in spec["path"]]
    frames = []
    durations = []
    positions = [scaled_path[0], *scaled_path, scaled_path[-1], scaled_path[-1]]
    for index, (x, y) in enumerate(positions):
        frame = source.copy().convert("RGBA")
        overlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        draw.rounded_rectangle((24, 24, 600, 112), radius=20, fill=(8, 56, 96, 232))
        draw.text((48, 40), title, font=font(25, True), fill="white")
        draw.text((48, 75), helper, font=font(17), fill="#d8f4f6")
        pressed = index >= len(positions) - 2
        cursor(draw, x, y, pressed)
        if pressed:
            draw.rounded_rectangle((frame.width - 250, frame.height - 72, frame.width - 24, frame.height - 24), radius=18, fill=(13, 126, 99, 238))
            draw.text((frame.width - 222, frame.height - 59), "✓  " + ("Ολοκληρώθηκε" if lang == "el" else "Completed"), font=font(18, True), fill="white")
        frames.append(Image.alpha_composite(frame, overlay).convert("P", palette=Image.Palette.ADAPTIVE, colors=192))
        durations.append(650 if index in (0, len(positions) - 1) else 320)
    output = GUIDE / f"{name}{suffix}.gif"
    frames[0].save(output, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True, disposal=2)
    print(f"generated {output.relative_to(ROOT)}")


if __name__ == "__main__":
    for demo_name, demo_spec in DEMOS.items():
        for language in ("el", "en"):
            make_demo(demo_name, demo_spec, language)
