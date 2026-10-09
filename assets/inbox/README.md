# Inbox for your own art and sounds

Drop images (PNG/JPG) or sounds (MP3/WAV/M4A) here and tell Claude what each one is, e.g.
"inbox/fox.png is a new shikigami called Momo". From a phone: open this folder on github.com,
tap **Add file → Upload files**, pick the file and commit. You can also attach the file
directly in a Claude message.

Claude imports each file with `scripts/gen/import_asset.py` (background removed, cropped,
resized to the fixed size, snapped to the day palette unless you ask to keep the colours;
sounds are trimmed, levelled and looped), wires it into the game, and deletes it from here.
