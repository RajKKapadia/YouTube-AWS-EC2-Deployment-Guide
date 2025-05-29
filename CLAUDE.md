# Habit Tracker Telegram Bot – Code Generation Instructions
Create a Telegram bot that helps users track their daily habits through a conversational interface.

### Core Features
* User Registration
* Identify and register users using their unique Telegram ID.
* Store user data persistently in the database.

### Habit Setup
* Ask new users to provide their daily habits one by one (e.g., "Did you exercise today?").
* Save these habits for each user in the database.
* Ensure users complete this setup before moving on to daily tracking.
* User can add new habit or delete an existing habbit

### Daily Habit Check-In
* Send a daily notification to each user at a set time (e.g., 8 PM).
* Ask the user to confirm whether they followed each of their habits (Yes/No).
* Record their responses in the database.
* User can stop and start their daily notifications

### Activity Tracking
#### Track:
* Whether a daily notification was sent.
* Whether the user responded, if not for that day, consider habbit not followed
* Record their responses.

### Weekly Summary
* Every Sunday at 10 in the morning, generate a summary for each user showing their weekly progress on all habits.
* Send this summary via Telegram message.
* Consider the Asia/Kolkata timezone for all the time related things

### Telegram Bot Features
* Add menu commands for better user experience
* Use buttons whenever possible for better interactivity
* Add short and long description about the Bot

### Technologies & Libraries
* Programming Language: TypeScript (with strict type safety)
* Pnpm package manager
* Database: Postgresql running locally, everytime when the application starts up check if the database is there or not, if not then create a new database
* Telegram Bot Framework: grammY (Telegram bot API wrapper for Node.js)
* Structure the application so it becomes easy to understand and manage
* Create a docker compose file to run the application and postgresql instance with a persistent stroage
* Write detailed comment when needed for further manage and modify the application
