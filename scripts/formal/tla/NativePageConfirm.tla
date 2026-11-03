---- MODULE NativePageConfirm ----
EXTENDS Naturals

CONSTANT RejectSourceError
Calls == {1, 2}
VARIABLES pc, observed, validation, result, status, head, writes, writerValidation, receipt
vars == <<pc, observed, validation, result, status, head, writes, writerValidation, receipt>>

Init ==
  /\ pc = [i \in Calls |-> "NEW"]
  /\ observed = [i \in Calls |-> "NONE"]
  /\ validation = [i \in Calls |-> "NONE"]
  /\ result = [i \in Calls |-> "NONE"]
  /\ status = "PENDING"
  /\ head = 1
  /\ writes = 0
  /\ writerValidation = "NONE"
  /\ receipt = FALSE

Observe(i) ==
  /\ pc[i] = "NEW"
  /\ observed' = [observed EXCEPT ![i] = status]
  /\ pc' = [pc EXCEPT ![i] = IF status = "APPLIED" THEN "VALIDATED" ELSE "OBSERVED"]
  /\ validation' = [validation EXCEPT ![i] = IF status = "APPLIED" THEN "SKIP" ELSE "NONE"]
  /\ UNCHANGED <<result, status, head, writes, writerValidation, receipt>>

Validate(i) ==
  /\ pc[i] = "OBSERVED"
  /\ \E outcome \in {"OK", "SOURCE_ERROR"}:
       validation' = [validation EXCEPT ![i] = outcome]
  /\ pc' = [pc EXCEPT ![i] = "VALIDATED"]
  /\ UNCHANGED <<observed, result, status, head, writes, writerValidation, receipt>>

Commit(i) ==
  /\ pc[i] = "VALIDATED"
  /\ IF status = "APPLIED"
     THEN /\ pc' = [pc EXCEPT ![i] = "COMMITTED"]
          /\ result' = [result EXCEPT ![i] = "REPLAY"]
          /\ UNCHANGED <<status, head, writes, writerValidation, receipt>>
     ELSE IF validation[i] = "OK" \/ ~RejectSourceError
          THEN /\ pc' = [pc EXCEPT ![i] = "COMMITTED"]
               /\ result' = [result EXCEPT ![i] = "NEW"]
               /\ status' = "APPLIED"
               /\ head' = 2
               /\ writes' = writes + 1
               /\ writerValidation' = validation[i]
               /\ receipt' = TRUE
          ELSE /\ pc' = [pc EXCEPT ![i] = "REJECTED"]
               /\ result' = [result EXCEPT ![i] = "SOURCE_ERROR"]
               /\ UNCHANGED <<status, head, writes, writerValidation, receipt>>
  /\ UNCHANGED <<observed, validation>>

Reply(i) ==
  /\ pc[i] = "COMMITTED"
  /\ \E delivery \in {"DELIVERED", "LOST"}: pc' = [pc EXCEPT ![i] = delivery]
  /\ UNCHANGED <<observed, validation, result, status, head, writes, writerValidation, receipt>>

Next == (\E i \in Calls: Observe(i) \/ Validate(i) \/ Commit(i) \/ Reply(i)) \/ UNCHANGED vars
Spec == Init /\ [][Next]_vars

NewRevisionRequiresSuccessfulSource == writes > 0 => writerValidation = "OK"
====
