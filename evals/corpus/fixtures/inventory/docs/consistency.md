# Inventory consistency

`reserve(sku, qty)` takes stock for an order; `adjust(sku, delta)` applies a stock
count correction. They are called from different request handlers and may run at the
same time.

> **Concurrent `reserve` and `adjust` on the same sku never lose an update: the final
> quantity equals the starting quantity minus every reserved amount plus every delta.**

Each function reads the record, applies its change and writes it back. `reserve` holds
`lockFor(sku)` while it works; `adjust` holds `lockFor(sku + ':adjust')` so a slow
count correction cannot block an order.
