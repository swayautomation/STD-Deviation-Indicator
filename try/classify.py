import cv2
import numpy as np

def classify_top_bottom(image_path, threshold=58.0):
    img = cv2.imread(image_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    blurred = cv2.GaussianBlur(gray, (9, 9), 0)
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    best = None
    best_area = 0
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 5000:
            continue
        if area > best_area:
            best_area = area
            best = cnt

    if best is None:
        print("No disc found")
        return None, None

    mask = np.zeros_like(gray)
    cv2.drawContours(mask, [best], -1, 255, -1)

    erode_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (40, 40))
    inner_mask = cv2.erode(mask, erode_kernel)

    score = gray[inner_mask == 255].std()
    label = "BOTTOM" if score > threshold else "TOP"

    print(f"StdDev Score  : {score:.2f}")
    print(f"Result        : {label}")

    x, y, w, h = cv2.boundingRect(best)
    cv2.drawContours(img, [best], -1, (0, 255, 0), 2)
    cv2.putText(img, f"{label}  (score={score:.1f})", (x, y - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
    cv2.imshow("Result", img)
    cv2.waitKey(0)
    cv2.destroyAllWindows()

    return label, score


if __name__ == "__main__":
    import sys
    path = sys.argv[1] if len(sys.argv) > 1 else "indicator.jpg"
    classify_top_bottom(path)