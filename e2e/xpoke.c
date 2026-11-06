/* Generate one real X input event (XTEST) so the X server's idle timer resets. */
#include <stdio.h>
typedef struct _XDisplay Display;
extern Display *XOpenDisplay(const char *);
extern int XTestFakeRelativeMotionEvent(Display *, int, int, unsigned long);
extern int XFlush(Display *);
extern int XCloseDisplay(Display *);
int main(void) {
  Display *d = XOpenDisplay(NULL);
  if (!d) { fprintf(stderr, "no display\n"); return 1; }
  XTestFakeRelativeMotionEvent(d, 5, 5, 0);
  XTestFakeRelativeMotionEvent(d, -5, -5, 0);
  XFlush(d); XCloseDisplay(d); return 0;
}
