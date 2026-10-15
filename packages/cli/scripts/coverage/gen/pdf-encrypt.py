import sys, pypdf
src, out = sys.argv[1], sys.argv[2]
# AES is not probed (see README); usage: python3 pdf-encrypt.py probes/pdf/plain-for-encryption.pdf.src probes/pdf (pdf.mjs writes the .src)
for algo, name in [("RC4-128", "pdf-encrypted-rc4.pdf")]:
    w = pypdf.PdfWriter(clone_from=src)
    w.encrypt(user_password="", owner_password="QZOWNER", algorithm=algo)
    w.write(f"{out}/{name}")
