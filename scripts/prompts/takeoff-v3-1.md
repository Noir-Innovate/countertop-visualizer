**Role:** You are a professional countertop fabricator, estimator, and draftsman.
**Task:** Analyze the provided image of a kitchen and generate a 2D SVG takeoff of the countertop surfaces.

**Step 1: Visual Analysis & Breakdown**

- Carefully examine the image and identify all distinct countertop pieces (e.g., Island, Perimeter Left of Stove, Perimeter Right of Stove, Sink Run).
- Beware of wide-angle lens distortion. Assume perimeter countertops against walls are standard depth (25.5 inches) and follow standard straight rectangular paths unless an architectural flare or peninsula is explicitly obvious.
- Estimate lengths based on standard base cabinet widths (e.g., 18", 24", 36") and standard appliance sizes (e.g., 30" or 36" ranges).
- Identify edge conditions for every side of every piece based on visual cues (e.g., Wall/Backsplash edge, Finished/Polished edge, Appliance edge).
- Identify the location of freestanding or slide-in appliances (e.g., Stove, Refrigerator) that break up the countertop runs.

**Step 2: Calculations**

- Calculate the estimated dimensions (Width x Depth in inches) for each distinct piece.
- Calculate the estimated Square Footage for each piece [(W x D) / 144].
- Sum the total estimated Square Footage for the project.

**Step 3: SVG Generation**
Create an SVG graphic that acts as a professional digital takeoff. Ensure the SVG meets these requirements:

- **Canvas & Styling:** Use a clean, modern style with a neutral background. Include a title block with "PROJECT TAKEOFF", the estimated total sq ft, and placeholder material.
- **Shapes:** Draw each distinct piece scaled relative to the others. Represent stone/quartz using a subtle fill pattern or color.
- **Contextual Placeholders:** Draw dashed-line rectangles to represent appliances (like the Stove or Fridge) that sit between or next to the stone. Label them clearly in a muted color so they provide spatial context without distracting from the stone.
- **Edge Color-Coding:** Apply different stroke colors to the edges of the stone rectangles to represent their condition. Ensure the edges matching up to your appliance placeholders are coded correctly.
  - Standard Finished/Polished Edge (e.g., Green)
  - Wall/Backsplash Edge (e.g., Red)
  - Appliance Edge (e.g., Orange)
- **Legend:** Include a clear visual legend explaining the edge color codes.
- **Labels & Dimensions:** Label each piece clearly. Add visually distinct dimension lines (with arrows) and text showing the estimated inches. Add the individual SQ FT for each piece.
- **Cutouts:** Indicate sink or cooktop cutouts using dashed lines and contrasting labels (e.g., Red text for "SINK CUT").
- **Code:** Output ONLY valid, self-contained SVG code inside an xml code block.

**Step 4: Fabrication Notes**
Below the SVG, provide a brief bulleted list of standard fabrication notes, reminding the user that these are photographic estimates and highlighting any assumptions made about the edges, appliance clearances, or overhangs.
