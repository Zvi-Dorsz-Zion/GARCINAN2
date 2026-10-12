# נוסחאות התלמוד — אנדרואיד

אפליקציה אופליין להשוואת נוסחאות הגמרא, על בסיס
[Talmud-Formulas-Software](https://github.com/ACHI-GARCINAN/Talmud-Formulas-Software).

## מאגר הנתונים (אופליין מלא)
- ברירת המחדל: ה-APK **לא** כולל את המאגר. בהפעלה הראשונה האפליקציה מבקשת לבחור את `talmud.db` מהמכשיר, שומרת אותו אצלה, ומשם עובדת בלי אינטרנט.
- החלפת מאגר: הגדרות (⚙) ← "מאגר נתונים" ← "החלפה".
- אפשר גם לשלב את המאגר בתוך ה-APK: Run workflow וסימון `bundle_db`.
- הקובץ חייב להיות SQLite. אם הורדתם ZIP — חלצו אותו קודם.

## חתימה קבועה (עדכון בלי הסרה)
APK שנחתם במפתח אחר לא מתעדכן מעל הקודם. לכן חותמים תמיד באותו מפתח, ומספר הגרסה (`versionCode`) עולה אוטומטית בכל בנייה.

### הגדרה חד־פעמית
1. צרו ריפו **פרטי** והעלו אליו את הפרויקט (כולל `.github`).
2. **Actions ← Generate signing keystore ← Run workflow.**
3. בסיום הורידו את ה-artifact `keystore-and-secrets`. **שמרו עותק של `release.jks` ושל הסיסמה במקום בטוח — אם יאבדו, אי אפשר יהיה לעדכן את האפליקציה.**
4. ב-**Settings ← Secrets and variables ← Actions ← New repository secret** הוסיפו:
   - `KEYSTORE_BASE64` — תוכן הקובץ `keystore_base64.txt`
   - `KEYSTORE_PASSWORD` — הערך מתוך `secrets_values.txt`
   - `KEY_ALIAS` — `talmud`
5. מחקו את ה-artifact ואת הריצה של שלב 2 (Actions ← ⋯ ← Delete).

### בנייה ועדכונים
**Actions ← Build Android APK ← Run workflow** (או push ל-main). מורידים את `TalmudFormulas-apk`, מתקינים. כל בנייה חדשה מתעדכנת מעל הקודמת, והנתונים שנבחרו נשמרים.
