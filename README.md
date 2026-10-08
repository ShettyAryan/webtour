# 3BHK Virtual Tour (Next.js)

```bash
npm install
npm run dev        # tour:  http://localhost:3000
                   # admin: http://localhost:3000/admin  (dev password: admin)
```

## Admin panel (`/admin`)
- **Rooms:** add, rename, reorder and delete rooms, and choose the opening room. For each room you can:
  - upload its 360 photo (JPG, PNG, WebP, AVIF, **TIF/TIFF**);
  - click the floor plan to set its **access point**;
  - turn the dial until the vision cone matches the photo;
  - set the starting view from the current camera angle.
- **Navigation hotspots:** clickable arrows inside each room's 360 photo that lead to another room. When both rooms are on the floor plan, a new hotspot is aimed at the other room automatically. "Move" lets you click the exact spot (for example a doorway), and "+ Way back" adds the return hotspot. Visitors arrive in the next room facing the direction they walked.
- **Floor plan:** upload or replace it (SVG, PNG, JPG, WebP), rotate it 90° either way, or crop it. Every access point and room direction is adjusted to match. Drag points to move them, and select an unplaced room and click the plan to place it. Access points are stored as fractions of the plan's size, so a re-export at a different resolution keeps them in place.
- **Video, brochure & settings:** upload an MP4 or paste a YouTube link, upload a brochure PDF, and change the project name and auto-rotate speed.

Nothing is live until you press **Save changes**. Saving also deletes uploads that are no longer used.

### Password
Create `.env.local`:
```
ADMIN_PASSWORD=choose-a-strong-password
```
In production (`npm run build && npm start`), the admin panel stays locked until `ADMIN_PASSWORD` is set.

## Where things live
| What | Where |
|---|---|
| Tour config (edited by admin) | `data/tour.json` |
| 360 photos | `data/panos/` |
| Floor plan, video, brochure | `data/media/` |

Back up the `data/` folder; it holds all your content. The site needs a server with a persistent disk (a VPS, or any Node host). It won't work on serverless hosts like Vercel, because uploads there are discarded.

Every photo goes through `/api/pano/<file>`. It comes out as an sRGB JPEG with an exact 2:1 ratio, black borders cut off, sized to fit the visitor's GPU. This means no black gaps and no black screen. Converted files are cached in `.cache/panos`.
