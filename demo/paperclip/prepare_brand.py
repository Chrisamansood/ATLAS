from pathlib import Path
root = Path(__file__).resolve().parents[1]/'.runtime/paperclip-source/ui'
for path in list((root/'src').rglob('*.tsx')) + list((root/'src').rglob('*.ts')) + [root/'index.html']:
    s=path.read_text()
    n=s.replace('Qvantel Agent Organization','ATLAS Agent Organization').replace('Qvantel','ATLAS')
    if path.name=='index.html':
        n='\n'.join(line for line in n.split('\n') if '/qvantel-nav.js' not in line and '/qvantel.css' not in line)
    if n!=s:path.write_text(n)
p=root/'src/components/PaperclipLockup.tsx'
s=p.read_text().replace('M13.5 6.2 a7.3 7.3 0 1 0 0.01 0 z M16.6 15.6 l4.2 4.2','M6 20 L13.5 6 L21 20 M9 15 H18').replace('ATLAS Agent Organization\n      </text>','ATLAS · Paperclip\n      </text>')
p.write_text(s)
print('Isolated ATLAS branding applied; original-instance navigation removed.')
p=root/'src/components/AnimatedPaperclipIcon.tsx'
s=p.read_text().replace('M12 4.6 a6.4 6.4 0 1 0 0.01 0 z M14.6 13.6 l3.6 3.6','M5 18 L12 5 L19 18 M8 13 H16')
p.write_text(s)
p=root/'public/favicon.svg'; p.write_text(p.read_text().replace('>Q</text>','>A</text>'))
p=root/'index.html'
p.write_text('\n'.join(line for line in p.read_text().split('\n') if '/favicon.ico' not in line and '/favicon-32x32.png' not in line and '/favicon-16x16.png' not in line and '/apple-touch-icon.png' not in line))
