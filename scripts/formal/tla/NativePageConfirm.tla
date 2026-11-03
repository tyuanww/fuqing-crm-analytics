---- MODULE NativePageConfirm ----
EXTENDS Naturals

CONSTANT RejectSourceError
CONSTANT RejectReplayRevoked
Calls == {1, 2}
VARIABLES pc, observed, validation, result, status, head, writes, writerValidation, receipt, replays
vars == <<pc, observed, validation, result, status, head, writes, writerValidation, receipt, replays>>

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
  /\ replays = {}

Observe(i) ==
  /\ pc[i] = "NEW"
  /\ observed' = [observed EXCEPT ![i] = status]
  /\ pc' = [pc EXCEPT ![i] = "OBSERVED"]
  /\ validation' = [validation EXCEPT ![i] = "NONE"]
  /\ UNCHANGED <<result, status, head, writes, writerValidation, receipt, replays>>

Validate(i) ==
  /\ pc[i] = "OBSERVED"
  /\ \E outcome \in {"OK", "SOURCE_ERROR", "REVOKED"}:
       validation' = [validation EXCEPT ![i] = outcome]
  /\ pc' = [pc EXCEPT ![i] = "VALIDATED"]
  /\ UNCHANGED <<observed, result, status, head, writes, writerValidation, receipt, replays>>

Commit(i) ==
  /\ pc[i] = "VALIDATED"
  /\ IF status = "APPLIED"
     THEN IF validation[i] = "REVOKED" /\ RejectReplayRevoked
          THEN /\ pc' = [pc EXCEPT ![i] = "REJECTED"]
               /\ result' = [result EXCEPT ![i] = "SOURCE_ERROR"]
               /\ UNCHANGED <<status, head, writes, writerValidation, receipt, replays>>
          ELSE /\ pc' = [pc EXCEPT ![i] = "COMMITTED"]
               /\ result' = [result EXCEPT ![i] = "REPLAY"]
               /\ replays' = replays \cup {i}
               /\ UNCHANGED <<status, head, writes, writerValidation, receipt>>
     ELSE IF validation[i] = "OK" \/ ~RejectSourceError
          THEN /\ pc' = [pc EXCEPT ![i] = "COMMITTED"]
               /\ result' = [result EXCEPT ![i] = "NEW"]
               /\ status' = "APPLIED"
               /\ head' = 2
               /\ writes' = writes + 1
               /\ writerValidation' = validation[i]
               /\ receipt' = TRUE
               /\ UNCHANGED <<replays>>
          ELSE /\ pc' = [pc EXCEPT ![i] = "REJECTED"]
               /\ result' = [result EXCEPT ![i] = "SOURCE_ERROR"]
               /\ UNCHANGED <<status, head, writes, writerValidation, receipt, replays>>
  /\ UNCHANGED <<observed, validation>>

Reply(i) ==
  /\ pc[i] = "COMMITTED"
  /\ \E delivery \in {"DELIVERED", "LOST"}: pc' = [pc EXCEPT ![i] = delivery]
  /\ UNCHANGED <<observed, validation, result, status, head, writes, writerValidation, receipt, replays>>

Next == (\E i \in Calls: Observe(i) \/ Validate(i) \/ Commit(i) \/ Reply(i)) \/ UNCHANGED vars
Spec == Init /\ [][Next]_vars

NewRevisionRequiresSuccessfulSource == writes > 0 => writerValidation = "OK"
ReplayRequiresNotRevoked == \A i \in Calls: i \in replays => validation[i] /= "REVOKED"
====
