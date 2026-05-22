import cv2
import numpy as np

IMAGE_PATH = r"D:\Sway\Customer\New folder\Indi_patchcore\app\backend\template\0007.jpg"

img = cv2.imread(IMAGE_PATH)
if img is None:
    print("Image not found")
    exit()

clone = img.copy()
roi_box = cv2.selectROI("Select ROI", clone, showCrosshair=True, fromCenter=False)
cv2.destroyWindow("Select ROI")

x, y, w, h = roi_box
if w == 0 or h == 0:
    print("No ROI selected")
    exit()

y1 = y
y2 = y + h
x1 = x
x2 = x + w

print(f"\n--- For JSON config ---")
print(f'"ROI": [{y1}, {y2}, {x1}, {x2}]')

cv2.rectangle(clone, (x1, y1), (x2, y2), (0, 255, 0), 2)
cv2.putText(clone, f"[{y1}, {y2}, {x1}, {x2}]", (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
cv2.imshow("ROI", clone)
cv2.waitKey(0)
cv2.destroyAllWindows()