---- MODULE PageBindingInvariant ----
EXTENDS Naturals

CONSTANTS Empty, Bound, InvalidUnknown, InvalidUndeclared, InvalidDuplicate,
          FailOpen

ManifestCases == {Empty, Bound, InvalidUnknown, InvalidUndeclared, InvalidDuplicate}
ValidCases == {Empty, Bound}
InvalidCases == {InvalidUnknown, InvalidUndeclared, InvalidDuplicate}

VARIABLES manifestCase, delivery, status, receiptManifest, pageManifest,
          bindingState, confirmCount

vars == << manifestCase, delivery, status, receiptManifest, pageManifest,
           bindingState, confirmCount >>

Init ==
  /\ manifestCase \in ManifestCases
  /\ delivery = "NONE"
  /\ status = "NEW"
  /\ receiptManifest = "NONE"
  /\ pageManifest = "NONE"
  /\ bindingState = "NONE"
  /\ confirmCount = 0

Deliver ==
  IF delivery = "NONE"
  THEN
    IF manifestCase \in ValidCases
    THEN
      /\ delivery' = "ACCEPTED"
      /\ receiptManifest' = manifestCase
      /\ UNCHANGED << manifestCase, status, pageManifest, bindingState, confirmCount >>
    ELSE
      IF FailOpen
      THEN
        /\ delivery' = "ACCEPTED"
        /\ receiptManifest' = Empty
        /\ UNCHANGED << manifestCase, status, pageManifest, bindingState, confirmCount >>
      ELSE
        /\ delivery' = "REJECTED"
        /\ receiptManifest' = "NONE"
        /\ UNCHANGED << manifestCase, status, pageManifest, bindingState, confirmCount >>
  ELSE UNCHANGED vars

Intake ==
  IF /\ delivery = "ACCEPTED"
     /\ status = "NEW"
  THEN
    /\ status' = "INTAKED"
    /\ UNCHANGED << manifestCase, delivery, receiptManifest,
                     pageManifest, bindingState, confirmCount >>
  ELSE UNCHANGED vars

Confirm ==
  IF status = "INTAKED"
  THEN
    /\ pageManifest' = receiptManifest
    /\ bindingState' = IF receiptManifest = Bound
                       THEN "BOUND_VERIFIED"
                       ELSE "UNBOUND_SAMPLE"
    /\ status' = "SAVED"
    /\ confirmCount' = confirmCount + 1
    /\ UNCHANGED << manifestCase, delivery, receiptManifest >>
  ELSE UNCHANGED vars

DuplicateConfirm == UNCHANGED vars

Readback == UNCHANGED vars

Next == Deliver \/ Intake \/ Confirm \/ DuplicateConfirm \/ Readback

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ manifestCase \in ManifestCases
  /\ delivery \in {"NONE", "ACCEPTED", "REJECTED"}
  /\ status \in {"NEW", "INTAKED", "SAVED"}
  /\ receiptManifest \in {"NONE"} \cup ManifestCases
  /\ pageManifest \in {"NONE"} \cup ManifestCases
  /\ bindingState \in {"NONE", "UNBOUND_SAMPLE", "BOUND_VERIFIED"}
  /\ confirmCount \in Nat

InvalidNeverAccepted ==
  manifestCase \in InvalidCases
  => /\ delivery # "ACCEPTED"
     /\ receiptManifest = "NONE"
     /\ status # "INTAKED"
     /\ status # "SAVED"

BoundNeverUnbound ==
  pageManifest = Bound => bindingState # "UNBOUND_SAMPLE"

ReceiptPreserved ==
  status = "SAVED" => pageManifest = receiptManifest

ConfirmAtMostOnce == confirmCount <= 1

====
