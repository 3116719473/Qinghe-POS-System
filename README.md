# Qinghe POS System

**An English-language Point of Sale (POS) system for supermarket checkout and store management.**

Qinghe POS is a lightweight, browser-based supermarket management application developed with Node.js and SQLite. It provides essential retail operations, including product checkout, order management, refunds, inventory control, and daily sales statistics.

The system is designed for a single-store local environment, with an intuitive interface and a streamlined cashier workflow.

## 1. Key Features

### 1.1 Checkout and Sales Management
- Search products by name or barcode.
- Add products to the shopping cart and adjust quantities.
- Calculate running totals automatically.
- Apply percentage-based price adjustments.
- Support cash payments and calculate change automatically.
- Generate printable receipts and save receipts as PDF.
- Hold and recall unfinished sales.

### 1.2 Order Management and Returns
- View completed sales and search by order number.
- Access detailed order information.
- Process full or partial returns.
- Record return reasons.
- Calculate refunds based on the original discounted selling price.
- Automatically restore returned items to inventory.

### 1.3 Product and Inventory Management
- Add and edit product information.
- Manage product barcodes, categories, prices, and units.
- Adjust inventory manually.
- Automatically deduct stock after successful sales.
- Restore stock after refunds.
- Track inventory movements.
- Display low-stock alerts.

### 1.4 Sales Overview
- View daily sales statistics.
- Monitor the number of completed orders.
- Track total sales and refunds.
- Calculate net receipts.
- Monitor products with low inventory.

## 2. Technology Stack

| Component | Technology |
|---|---|
| Frontend | HTML5, CSS3, JavaScript |
| Backend | Node.js |
| Server | Native Node.js HTTP Server |
| Database | SQLite |
| Database API | Node.js `node:sqlite` |
| Testing | Node.js Test Runner |
| Architecture | Browser-based frontend and backend service |

The application uses native Node.js modules and does not require additional third-party npm packages for its core functionality.

## 3. Project Structure

```text
Qinghe-POS-System/
└── ProjectPos/
    └── Source_Code/
        ├── server.js
        ├── package.json
        ├── START.bat
        ├── public/
        │   ├── index.html
        │   ├── app.js
        │   ├── style.css
        │   ├── english.css
        │   ├── terminal.css
        │   └── favicon.svg
        ├── src/
        │   ├── store.js
        │   └── legacy-catalog.json
        └── test/
            ├── store.test.js
            ├── browser.mjs
            └── terminal.mjs
```

### Main Components

- `server.js`: Starts the HTTP server and handles API requests.
- `public/`: Contains the frontend interface, stylesheets, and client-side JavaScript.
- `src/store.js`: Implements the POS business logic and SQLite database operations.
- `src/legacy-catalog.json`: Contains product catalog migration and localization data.
- `test/`: Contains automated tests and browser-related test scripts.
- `START.bat`: Provides a convenient Windows startup script.

## 4. Installation and Usage

### Prerequisites

- Node.js 22.13.0 or later.
- A modern web browser.
- Windows is supported through the provided startup script.

### Option 1: Windows Quick Start

1. Download or clone this repository.
2. Open the `ProjectPos/Source_Code/` directory.
3. Double-click `START.bat`.
4. Open the following address in your browser:

```text
http://127.0.0.1:3000
```

### Option 2: Command Line

Navigate to the `Source_Code` directory and run:

```bash
node server.js
```

Then open:

```text
http://127.0.0.1:3000
```

The application automatically creates its local data directory and SQLite database when it starts.

## 5. Testing

The project uses the built-in Node.js test runner.

Run the following command from the `Source_Code` directory:

```bash
npm test
```

This executes the automated test files configured in `package.json`.

## 6. System Architecture

The application follows a simple separation of responsibilities:

1. **Presentation Layer:** Provides the browser-based user interface and cashier interactions.
2. **Application Layer:** Handles HTTP requests and exposes API endpoints.
3. **Business Logic Layer:** Implements sales, refunds, product management, and inventory operations.
4. **Data Layer:** Uses SQLite to store products, sales, sale items, refunds, and stock movement records.

Database transactions are used for important business operations to maintain data consistency.

## 7. Scope and Limitations

Qinghe POS is designed as a single-store local demonstration system.

The current implementation does not include:

- User authentication and role-based access control.
- A live payment gateway or automatic bank/wallet transactions.
- Multi-store synchronization.
- Tax calculation or membership management.
- External weighing-scale integration.

External payment methods can be recorded after the cashier verifies payment through an external terminal. Refunds are processed in cash.

## 8. Project Information

| Item | Details |
|---|---|
| Project Name | Qinghe POS |
| Version | 1.2.0 |
| Project Type | Supermarket Point of Sale System |
| Interface Language | English |
| Database | SQLite |
| Runtime | Node.js |
| Repository | GitHub |

---

**Qinghe POS — A lightweight solution for everyday supermarket checkout and inventory management.**
