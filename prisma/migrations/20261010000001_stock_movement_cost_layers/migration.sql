-- Perpetual FIFO inventory costing: each inbound stock movement (RECEIPT,
-- OPENING, RETURN_IN) is a cost layer. costLayerRemaining tracks how much of
-- that layer's quantity hasn't yet been consumed by a later outbound
-- movement (SHIPMENT, a negative ADJUSTMENT, RETURN_OUT). NULL and unused
-- for an outbound movement itself.
ALTER TABLE "StockMovement" ADD COLUMN "costLayerRemaining" DECIMAL(18,4);

-- Backfill: every existing inbound movement starts out fully unconsumed,
-- then every existing outbound movement is replayed in chronological order,
-- consuming the oldest remaining layers first — the same FIFO algorithm
-- shipStock() now runs live going forward. This does NOT rewrite the
-- unitCost already recorded (or, before this feature, never recorded) on
-- any existing outbound movement — a stock movement is never rewritten,
-- same as a posted JournalEntry is never edited. It only reconstructs which
-- inbound layers are still available, so the very next shipment of each
-- product costs correctly from here on.
UPDATE "StockMovement"
SET "costLayerRemaining" = "quantity"
WHERE "type" IN ('RECEIPT', 'OPENING', 'RETURN_IN');

DO $$
DECLARE
  outbound RECORD;
  layer RECORD;
  remaining_to_consume NUMERIC;
  take_qty NUMERIC;
BEGIN
  FOR outbound IN
    SELECT id, "productId", "date", "createdAt", ABS("quantity") AS qty
    FROM "StockMovement"
    WHERE ("type" IN ('SHIPMENT', 'RETURN_OUT'))
       OR ("type" = 'ADJUSTMENT' AND "quantity" < 0)
    ORDER BY "date" ASC, "createdAt" ASC
  LOOP
    remaining_to_consume := outbound.qty;
    IF remaining_to_consume <= 0 THEN
      CONTINUE;
    END IF;

    FOR layer IN
      SELECT id, "costLayerRemaining"
      FROM "StockMovement"
      WHERE "productId" = outbound."productId"
        AND "type" IN ('RECEIPT', 'OPENING', 'RETURN_IN')
        AND "costLayerRemaining" > 0
      ORDER BY "date" ASC, "createdAt" ASC
    LOOP
      EXIT WHEN remaining_to_consume <= 0;
      take_qty := LEAST(layer."costLayerRemaining", remaining_to_consume);
      UPDATE "StockMovement" SET "costLayerRemaining" = "costLayerRemaining" - take_qty WHERE id = layer.id;
      remaining_to_consume := remaining_to_consume - take_qty;
    END LOOP;
  END LOOP;
END $$;
