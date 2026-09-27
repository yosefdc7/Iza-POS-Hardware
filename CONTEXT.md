# Context: Receipt Series, Company Entity, and Sales Reporting

## Glossary

### Receipt Series
A sequence of monotonically incrementing numeric receipt identifiers assigned atomically upon completed checkout.
- Acts as the company / receipt selection mechanism for multi-entity ticketing (e.g. `211` and `CHB`).
- Cashiers select the series during checkout.
- Each Sale is linked to exactly one `ReceiptSeries` via `receiptSeriesId`.

### Base Price
The standard catalog retail price (`Product.price`) at the time of sale.
- Recorded on `SaleItem` as a reference snapshot so reports can compare standard base price against actual negotiated selling price.

### Selling Price
The final per-unit price charged to the customer on a transaction item (`SaleItem.price`).
- Can differ from `basePrice` if modified, discounted, or derived from wholesale/packaging tiers.

### Delivery Receipt / Sales Invoice (DR / SI No.)
An optional manual physical booklet reference identifier (`Sale.drSiNumber`) entered at checkout by the cashier.
- Enables reconciliation between paper DR/SI booklets and digital POS sales records.

### Offline Receipt
A provisional receipt generated and printable at the register while disconnected from the server.
- Bears the chosen Receipt Series prefix and an offline discriminator tag (e.g. `211-OFF-000042`).
- Guaranteed to issue immediately so customers receive a tangible slip even during network outages.
- Reconciles to an authoritative server `Sale` record when connectivity returns.

### Local Stock Allocation
An immediate decrement applied to the client-side cached inventory during an offline sale.
- Prevents cashiers from inadvertently selling non-existent physical inventory during prolonged offline operations.
- Triggers low-stock and out-of-stock register warnings immediately without waiting for server sync.

