# Loan Policy

## Overview | نظرة عامة
### English
This policy defines the rules and procedures that Bank of Palestine branches follow when receiving, reviewing, and approving personal and business loan applications. It is intended to ensure consistent, fair, and compliant lending decisions across all branches.

### العربية
تحدد هذه السياسة القواعد والإجراءات التي تتبعها فروع بنك فلسطين عند استلام طلبات القروض الشخصية والتجارية ومراجعتها والموافقة عليها. وتهدف إلى ضمان اتخاذ قرارات إقراض متسقة وعادلة ومتوافقة مع الأنظمة في جميع الفروع.

## Loan Eligibility | أهلية القرض
### English
To be eligible for a loan, the applicant must meet the following conditions:
- The applicant must be at least 21 years old at the time of application.
- The applicant must hold a valid national ID.
- The applicant must have a stable and verifiable source of income.
- The applicant must not have any unresolved defaulted loans with the bank.
- Business loan applicants must provide a valid commercial registration certificate.

### العربية
ليكون مقدم الطلب مؤهلاً للحصول على قرض، يجب أن تتوفر فيه الشروط التالية:
- أن لا يقل عمر مقدم الطلب عن 21 عاماً عند تقديم الطلب.
- أن يكون لديه بطاقة هوية وطنية سارية المفعول.
- أن يكون لديه مصدر دخل ثابت وقابل للتحقق منه.
- ألا تكون عليه قروض متعثرة غير مسددة لدى البنك.
- على مقدمي طلبات القروض التجارية تقديم شهادة سجل تجاري سارية.

## Required Documents | المستندات المطلوبة
### English
Every loan application must include the following documents before it can be processed:
- A valid national ID (original and a clear copy).
- A salary certificate or other acceptable proof of income.
- The last 6 months of bank statements.
- Proof of address (utility bill or rental contract).
- For business loans: commercial registration and the latest financial statements.

Applications submitted with missing documents will not be processed until all required documents are provided.

### العربية
يجب أن يتضمن كل طلب قرض المستندات التالية قبل أن تتم معالجته:
- بطاقة هوية وطنية سارية (الأصل مع نسخة واضحة).
- شهادة راتب أو إثبات دخل مقبول آخر.
- كشف حساب بنكي لآخر ستة أشهر.
- إثبات عنوان السكن (فاتورة خدمات أو عقد إيجار).
- بالنسبة للقروض التجارية: السجل التجاري وأحدث القوائم المالية.

لن تتم معالجة الطلبات المقدمة بمستندات ناقصة حتى يتم استكمال جميع المستندات المطلوبة.

## Income Requirements | متطلبات الدخل
### English
Income is assessed to confirm the applicant can repay the loan:
- The applicant's existing debt ratio must not exceed 50% of monthly income.
- The monthly loan installment must not exceed 40% of net monthly income.
- Self-employed applicants must provide at least 12 months of income history.
- Irregular or unverifiable income may reduce the approved loan amount.

### العربية
يتم تقييم الدخل للتأكد من قدرة مقدم الطلب على سداد القرض:
- يجب ألا تتجاوز نسبة المديونية الحالية لمقدم الطلب 50% من الدخل الشهري.
- يجب ألا يتجاوز القسط الشهري للقرض 40% من صافي الدخل الشهري.
- على أصحاب الأعمال الحرة تقديم سجل دخل لا يقل عن 12 شهراً.
- قد يؤدي الدخل غير المنتظم أو غير القابل للتحقق إلى تخفيض مبلغ القرض الموافق عليه.

## Rejection Conditions | أسباب الرفض
### English
A loan application may be rejected for any of the following reasons:
- Incomplete or missing required documents.
- Poor credit history or a record of late repayments.
- A debt ratio that exceeds 50% of monthly income.
- Insufficient or unverifiable income.
- Suspicion of fraud or falsified documents.

### العربية
قد يُرفض طلب القرض لأي من الأسباب التالية:
- نقص المستندات المطلوبة أو عدم اكتمالها.
- سجل ائتماني سيئ أو وجود تأخر في السداد.
- تجاوز نسبة المديونية 50% من الدخل الشهري.
- دخل غير كافٍ أو غير قابل للتحقق منه.
- الاشتباه في وجود احتيال أو مستندات مزورة.

## Processing Time | مدة المعالجة
### English
Standard processing times after a complete application is received:
- Personal loans: 3 to 5 business days.
- Business loans: 5 to 10 business days.
- Complex or high-value applications may require additional review time and a risk department assessment.

### العربية
أوقات المعالجة المعتادة بعد استلام طلب مكتمل:
- القروض الشخصية: من 3 إلى 5 أيام عمل.
- القروض التجارية: من 5 إلى 10 أيام عمل.
- قد تتطلب الطلبات المعقدة أو ذات القيمة العالية وقتاً إضافياً للمراجعة وتقييماً من دائرة المخاطر.

## Loan Approval Workflow | سير الموافقة على طلب القرض
### English
Every loan request moves through four sequential stages. A request is never visible to the next stage until the current stage approves it.

1. A Branch Employee creates and submits a loan assessment. The submitted request enters the status `pending_branch_manager_approval`.
2. A Branch Manager reviews the request. The Branch Manager may approve or reject it. If approved, the request moves to the Risk Department queue with status `pending`. If rejected, the request receives status `rejected`.
3. The Risk Department reviews the Branch Manager-approved request. If the deterministic eligibility result is `not_eligible`, approving the request requires a documented override reason. If Risk approves, the request moves to the Audit Department queue with status `pending_audit_approval`. If Risk rejects, the request receives status `rejected`.
4. The Audit Department performs the final review. If Audit approves, the request receives final status `audit_approved`. If Audit rejects, the request receives status `rejected`.
5. Rejection is a soft rejection. The loan request is retained in the system for audit and compliance purposes rather than deleted.
6. The internal AI assistant can explain workflow information, but it does not approve, reject, or override a loan decision.

### العربية
يمر كل طلب قرض بأربع مراحل متتابعة. لا يظهر الطلب للمرحلة التالية قبل أن توافق عليه المرحلة الحالية.

1. يقوم موظف الفرع بإنشاء تقييم القرض وإرساله. تدخل المعاملة في حالة `pending_branch_manager_approval`.
2. يراجع مدير الفرع الطلب. يمكنه الموافقة أو الرفض. عند الموافقة ينتقل الطلب إلى قائمة قسم المخاطر بحالة `pending`. وعند الرفض تصبح الحالة `rejected`.
3. يراجع قسم المخاطر الطلب بعد موافقة مدير الفرع. إذا كانت نتيجة الأهلية deterministic هي `not_eligible`، فإن الموافقة تتطلب سبب تجاوز موثق. عند موافقة قسم المخاطر ينتقل الطلب إلى قائمة قسم التدقيق بحالة `pending_audit_approval`. وعند الرفض تصبح الحالة `rejected`.
4. يقوم قسم التدقيق بالمراجعة النهائية. عند الموافقة النهائية تصبح الحالة `audit_approved`. وعند الرفض تصبح الحالة `rejected`.
5. الرفض هو soft rejection، أي يتم الاحتفاظ بطلب القرض في النظام لأغراض التدقيق والامتثال ولا يتم حذفه.
6. يستطيع المساعد الداخلي شرح سير العمل، لكنه لا يوافق أو يرفض أو يتجاوز قرار القرض.
