**My Restro**  
**Hirerachy and portals:**

- Super Admin  
- Owner  
- Staff (waiter)  
- Customer  
- Shareholder

**ENUM** : 

- **Discounttype:** flat, percentage.  
- **Paymentstatus:** pending, success, failed.  
- **Paymentmethod:** cash, e-wallet.  
- **Ordertype:** table, packing, delivery.  
- **Orderstatus:** pending, accepted, running, ready, rejected.  
- **Transactiontype**: in, out.  
- **Transaction category:** transaction fee, subscription fee, smsusage, sharedistribution, sharewithdrawal, duepaid, ledgercredit, ledgerdebit, salary.  
- **Stocklogtype:** in, out.  
- **Withdrawalstatus:** pending, approved, reject.  
- **Bulknotification**: sms, push.

**Models:**

- **User**: phone, name, roleowner, staff, customer, isshareholder, balance, duebalance, fcmtocken, image, sharepercentage.  
- **Otp:** user, phone, otp, purpose, isused.  
- **Restaurant:** user, slug, name, phone, logo, address, latitude, longitude, duebalance, subscriptionstart, subscriptionend, isopen, pertransactionfee, candelivery.  
- **Supplier**: name, restaurant, phone, image.  
- **Unit**: name, symbol, restaurant.  
- **Category**: name, image, restaurant, parent(category).  
- **Product**: name, restaurant, category, image, isactive, isveg.  
- **Productitem:** product, unit, price, discounttype, discount.  
- **Raw material:** name, restaurant, supplier, unit, price, stock, minstock.  
- **Product Raw Material**: restaurant, product, productitem, rawmaterial, rawmaterialquantity.  
- **Combo set:** restaurant, name, image, description, products(many to many), price.  
- **Table**: restaurant, name, capacity, floor, nearby, notes, image, latitude, longitude.  
- **Staff**: restaurant, user, rolewaiter, cashier, kitchen, joinedat, salary, salaryperday, issuspend.  
- **Order:** customer(user/null), restaurant, table (null), orderid, ordertype, address, latitude, longitude, status, paymentstatus, paymentmethod, fcmtoken, waiter(user), peoplefor, subtotal, discount, total, rejectreason.  
- **Orderitem**: order, product, productitem (null), comboset, price, quantity, total.  
- **Purchase**: restaurant, supplier, purchaseid, subtotal, discounttype, discount, total.  
- **Purchaseitem**: rawmaterial, purchase, price, quantity, total.  
- **Expense**: restaurant, expenseid, particular, amount.  
- **Ledger:** restaurant, partytype(customer, staff, supplier), partyid, particular, amount, type(debit/credit).  
- **Transaction**: restaurant, amount, paymentstatus, remarks, transactiontype, category, ledger, issystem.  
- **Stocklog**: restaurant, rawmaterial, type, quantity, purchase, purchaseitem, order, orderitem.  
- **Super setting:** subscriptionfeepermonth, pertransactionfee, duethreshold, smsperusage, balance.  
- **Shareholder withdrawal**: user, amount, status, rejectreason, remarks.  
- **BulkNotifications**: restaurant, message, receivers(json), image, type.