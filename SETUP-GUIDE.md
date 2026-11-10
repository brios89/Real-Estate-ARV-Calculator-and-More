# Setup Guide: Hobknob Co-Living Academy Deal Analyzer

1. In Vercel, open the project, then Settings, then Environment Variables.
2. Add `ACADEMY_PASSCODE` with the passcode you give students. Apply it to Production (and Preview if you use previews).
3. Redeploy so the new variable takes effect.
4. To change the passcode later (for example when a cohort ends), edit the variable and redeploy. Students who saved the old passcode are asked for the new one the next time they open the app.

Passcodes are not case sensitive. Leading and trailing spaces are ignored.

Saved deals live in each student's own browser. Clearing browser data or switching devices starts them fresh. The Report button downloads a copy they can keep.
