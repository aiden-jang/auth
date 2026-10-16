# Password reveal and field details

Showing or hiding a password returns focus to the input and preserves its selection
and exact value. Revealed passwords keep spelling correction and capitalization
disabled. Autofill and selected text use the account palette.

- [Desktop password field](password-1440.png)
- [Phone password field](password-390.png)

The browser regression exercises both toggle directions with a synthetic draft;
it never submits that password. Account recovery journeys use isolated local data.
Physical password managers and native autofill remain device checks.
