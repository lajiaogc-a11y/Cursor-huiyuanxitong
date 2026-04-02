-- =====================================================
-- 采集caiji 账本明细补全 Migration
-- 补全 2026/2/15 13:12:27 之后缺失的账本记录
-- 包含: 62条订单 + 3条提款 + 1条初始余额重置 = 66条
-- 同时修正已有账本记录的余额
-- =====================================================

-- 插入缺失的66条账本记录
INSERT INTO ledger_transactions
  (id, account_id, account_type, source_type, source_id, amount, before_balance, after_balance, is_active, reversal_of, note, operator_id, operator_name, created_at)
VALUES
  ('052a133b-4d90-417f-912d-dabf609dec0d', '采集caiji', 'card_vendor', 'order', '519f58eb-4aa6-480b-941a-08c767235f40', 92.5, -9877.85, -9785.35, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-18 16:17:09.000000+00'),
  ('198ed780-0ac8-49d6-9aa6-94c9677e47ee', '采集caiji', 'card_vendor', 'order', '34628f35-222d-40b4-84c4-d07ee98b34f4', 262.5, -9785.35, -9522.85, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-19 01:14:55.000000+00'),
  ('728ebbfe-2c92-41b9-a6e2-86e23e47b3d0', '采集caiji', 'card_vendor', 'order', '498164c9-bcbb-437f-bd3f-fdf77cdf16c0', 51.5, -9522.85, -9471.35, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-19 19:27:11.000000+00'),
  ('ff06d6ee-b8bb-4e92-b85b-118ec6d250d9', '采集caiji', 'card_vendor', 'order', '0da94517-c7f0-4065-8dbd-6f45ab15f5c3', 137.0, -9471.35, -9334.35, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-19 19:29:08.000000+00'),
  ('d95d08ca-e9a4-427f-bf42-d01d8ebc800a', '采集caiji', 'card_vendor', 'order', 'c6216928-b2cb-44b5-a3c2-d8b84d212a85', 109.6, -9334.35, -9224.75, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-19 19:35:48.000000+00'),
  ('3bd9cf4d-b2d1-4496-87b9-7adf30972b79', '采集caiji', 'card_vendor', 'order', 'd61680f9-aba0-4112-b686-5fa8d6e3bd38', 274.0, -9224.75, -8950.75, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-19 19:37:46.000000+00'),
  ('eaf7f869-0dbd-4c6b-b032-1b4178c5e68c', '采集caiji', 'card_vendor', 'order', 'ed8a0d47-3206-4ae3-bf10-8d6d3618d2e8', 135.75, -8950.75, -8815.0, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-19 23:19:02.000000+00'),
  ('ecce5153-cffc-4e51-a2e3-668ea748bc61', '采集caiji', 'card_vendor', 'order', '36541dba-2c81-47ee-b797-f68b73cf1ead', 560.0, -8815.0, -8255.0, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-20 03:40:39.000000+00'),
  ('64ea8523-e81b-428a-843e-292543942d24', '采集caiji', 'card_vendor', 'order', 'e9a42c43-beea-4a07-9e9e-f3a6330499f1', 66.0, -8255.0, -8189.0, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-20 05:48:44.000000+00'),
  ('47a8e2ba-c583-4c87-b183-6b55788355fb', '采集caiji', 'card_vendor', 'order', 'd15ea110-1a8e-49a3-9f5b-89cb2ab00f4a', 135.0, -8189.0, -8054.0, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-20 12:03:27.000000+00'),
  ('0662ac91-ad24-487f-853d-9f3ab81ced7a', '采集caiji', 'card_vendor', 'order', '52b960ef-7fb7-420f-9759-5d27a9b14bfa', 33.0, -8054.0, -8021.0, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-20 13:22:33.000000+00'),
  ('7c12fc24-fb79-48e9-8f25-f7d9fc4b282b', '采集caiji', 'card_vendor', 'order', '8bd5eaec-3b55-4ac5-9890-4e989c631200', 135.0, -8021.0, -7886.0, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-20 14:03:07.000000+00'),
  ('522f5357-9c32-424f-8f71-1a6239432452', '采集caiji', 'card_vendor', 'order', '69cc55e7-8467-482d-be18-55d1acacd5e2', 94.0, -7886.0, -7792.0, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-20 19:27:43.000000+00'),
  ('b62ee9ae-2339-4fb7-8f05-6c60f332b731', '采集caiji', 'card_vendor', 'order', 'cc1ed51a-fb7d-4a94-8c43-0c840ad1e484', 105.0, -7792.0, -7687.0, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-21 07:16:58.000000+00'),
  ('1e0b0f9f-2bc7-44af-9777-af26faa286af', '采集caiji', 'card_vendor', 'order', '7bd42942-0c09-4c6e-9850-9b43d4410717', 79.8, -7687.0, -7607.2, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-21 09:01:44.000000+00'),
  ('6a1dcd89-5442-4ace-88e1-74309fa316d1', '采集caiji', 'card_vendor', 'order', 'c7602617-89a8-4d37-b885-a6868d3523f0', 140.0, -7607.2, -7467.2, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-21 12:36:39.000000+00'),
  ('8583e088-13e7-444c-98d8-f9df9a869703', '采集caiji', 'card_vendor', 'order', 'f874f543-7276-4e77-90b9-908fd109e030', 70.0, -7467.2, -7397.2, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-21 14:55:03.000000+00'),
  ('e0188797-b099-4001-a81e-04fc75eaa000', '采集caiji', 'card_vendor', 'order', '65848922-5489-4241-92c4-f0880cf4c711', 270.0, -7397.2, -7127.2, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-21 22:57:48.000000+00'),
  ('f7aadecd-cafe-4cd0-bcfb-1a74c529b0fb', '采集caiji', 'card_vendor', 'order', '9904389b-2f28-4cff-87f3-839718902e45', 3090.0, -7127.2, -4037.2, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-22 09:21:01.000000+00'),
  ('0480a5ab-9e3f-4b72-bbe2-d09c7dc44ddd', '采集caiji', 'card_vendor', 'order', '8e8385d8-777b-4a60-9103-878d83799cc6', 230.0, -4037.2, -3807.2, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-22 11:08:33.000000+00'),
  ('587675b7-085c-4bef-b3b1-269855105979', '采集caiji', 'card_vendor', 'order', '7824d1ec-66bb-44f3-9058-7e286de22e3b', 53.6, -3807.2, -3753.6, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-22 17:29:35.000000+00'),
  ('6abdd065-e013-4049-8f88-f839e7019248', '采集caiji', 'card_vendor', 'order', 'cc680d38-7d7a-4495-bc4a-35ef9f945fb5', 270.0, -3753.6, -3483.6, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-22 21:48:31.000000+00'),
  ('b616353e-7c85-4ccf-b32a-dd70c2fcccbc', '采集caiji', 'card_vendor', 'withdrawal', 'WD_1771838108993_r56x', -7667.0, -3483.6, -11150.6, true, NULL, '录入卡商提款: 采集caiji - 7667', NULL, NULL, '2026-02-23 09:15:10.000000+00'),
  ('844ba2c5-ae10-40ca-980a-2cde67170ab3', '采集caiji', 'card_vendor', 'order', 'fe06d6a6-ff62-4c58-8bb3-a5a9dc6fdbab', 2600.0, -11150.6, -8550.6, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-23 11:10:01.000000+00'),
  ('014679c2-c1e6-4a89-bdef-7933a6db01bb', '采集caiji', 'card_vendor', 'order', '8bab9099-8476-460b-b069-448e9896858b', 525.0, -8550.6, -8025.6, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-23 12:12:45.000000+00'),
  ('a9dba463-c4e4-4604-bc1c-cdecc8f72be2', '采集caiji', 'card_vendor', 'order', '52884108-8318-420c-95b1-455ac4095ba7', 175.0, -8025.6, -7850.6, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-23 19:55:01.000000+00'),
  ('cacc9fed-22fe-4dab-925c-b65726cc5de2', '采集caiji', 'card_vendor', 'order', 'decfe1b6-f416-45b6-bb37-dea0d2316d8e', 102.0, -7850.6, -7748.6, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-23 22:23:39.000000+00'),
  ('30f00653-494a-40d3-bd4e-c9afb2f131ba', '采集caiji', 'card_vendor', 'order', 'f3a7529c-f66b-4e31-b7e4-7b48842b2e05', 136.25, -7748.6, -7612.35, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-23 23:03:01.000000+00'),
  ('30e8b487-289c-4ce1-b107-547d3c3eae65', '采集caiji', 'card_vendor', 'order', '90c5f8f9-c7fc-4399-8daa-6d0b9b86a8d8', 162.9, -7612.35, -7449.45, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-24 03:53:58.000000+00'),
  ('8e9fa980-eaf2-4c96-976c-6315020dc2e5', '采集caiji', 'card_vendor', 'order', '698c3b9f-30a3-49cf-8bbc-c985f939977a', 102.0, -7449.45, -7347.45, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-24 14:31:49.000000+00'),
  ('907970a8-fcec-449e-aad9-ed8581a549a8', '采集caiji', 'card_vendor', 'order', '595b2324-b1dd-4ec8-ad7b-790e149f16dc', 201.0, -7347.45, -7146.45, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-24 14:43:10.000000+00'),
  ('572ff9a4-cd45-46fe-8437-fab51684c189', '采集caiji', 'card_vendor', 'order', '8abcaa19-9d75-4639-b245-293074b350cf', 1050.0, -7146.45, -6096.45, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-24 18:11:45.000000+00'),
  ('dacc85c2-f018-4e44-b70e-44a86fffd00c', '采集caiji', 'card_vendor', 'order', '6055df80-93d8-473c-b0b7-f06e0171458b', 114.0, -6096.45, -5982.45, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-24 19:39:07.000000+00'),
  ('0e891e72-b31f-4a54-9afd-6edda66531a7', '采集caiji', 'card_vendor', 'order', 'ff5605bd-7e48-4280-9588-83a9e6b7bcff', 874.5, -5982.45, -5107.95, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-24 19:43:22.000000+00'),
  ('ad53b79b-e27e-492c-9705-44077d9c543e', '采集caiji', 'card_vendor', 'order', 'e37f627e-39ad-40c4-a5ea-60efb18ec2f4', 350.0, -5107.95, -4757.95, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-24 20:10:57.000000+00'),
  ('486d0f71-e158-40a7-9bf6-e3cd4aaf592b', '采集caiji', 'card_vendor', 'order', 'f964ce1d-e76f-43df-bfd6-6d110813b90b', 101.0, -4757.95, -4656.95, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-25 02:51:14.000000+00'),
  ('13c79a1d-c795-44dd-a812-9bdd623fe490', '采集caiji', 'card_vendor', 'order', 'e496c655-7dd4-483a-aab7-d69568f4d610', 540.0, -4656.95, -4116.95, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-25 08:00:27.000000+00'),
  ('5706a062-d7f6-4e33-acb2-c384dec9bdd8', '采集caiji', 'card_vendor', 'order', '145d0861-7ef1-4704-93ca-ad9e3df8a05a', 1312.5, -4116.95, -2804.45, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-25 08:01:39.000000+00'),
  ('931dfee7-fb19-4b71-b767-f0bc24f8db0e', '采集caiji', 'card_vendor', 'withdrawal', 'WD_1772008267549_iwhx', -10455.0, -2804.45, -13259.45, true, NULL, '录入卡商提款: 采集caiji - 10455', NULL, NULL, '2026-02-25 08:31:08.000000+00'),
  ('4f322678-3616-4d3b-b81a-ccca335ec2bc', '采集caiji', 'card_vendor', 'order', 'c7ee39c1-1471-4e42-8aa2-236c0ff41752', 480.0, -13259.45, -12779.45, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-25 19:15:07.000000+00'),
  ('7faf7d6e-1493-4205-924b-98bb7d397e86', '采集caiji', 'card_vendor', 'order', 'a1b9b757-7947-468d-ab2d-e118b6ba1cea', 2985.0, -12779.45, -9794.45, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-25 23:35:39.000000+00'),
  ('074f66f8-25ef-42b2-83d1-6b2290f3e49e', '采集caiji', 'card_vendor', 'order', 'eab7c106-2b8e-4f0f-9a10-d83f203fa1e7', 76.5, -9794.45, -9717.95, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-26 02:04:52.000000+00'),
  ('e38cf265-01be-42dc-a10a-15076a1a212c', '采集caiji', 'card_vendor', 'order', 'a7641faf-d03c-4c64-9808-244e26833188', 102.0, -9717.95, -9615.95, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-26 03:11:28.000000+00'),
  ('185abffe-c15e-4fc1-992f-817eeb94658f', '采集caiji', 'card_vendor', 'order', 'e7d027a4-0da5-493b-b8c1-1574d8908950', 139.0, -9615.95, -9476.95, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-26 03:12:24.000000+00'),
  ('ba60026f-f2cd-448f-9acb-675b45fb204c', '采集caiji', 'card_vendor', 'order', 'd4812ef7-c94a-4a8d-b99d-5d0391551d8c', 357.0, -9476.95, -9119.95, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-26 06:23:51.000000+00'),
  ('79de72af-029f-4332-979c-b837c839b226', '采集caiji', 'card_vendor', 'order', 'e7687a8e-1c9d-481a-9a5b-1bb2a566136a', 714.0, -9119.95, -8405.95, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-26 06:54:15.000000+00'),
  ('03671cd7-b39c-4bfa-99e5-da27262ec230', '采集caiji', 'card_vendor', 'order', 'bd0cdfe8-5628-46c5-bf42-c28daf90c5bb', 51.5, -8405.95, -8354.45, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-26 11:13:56.000000+00'),
  ('3d7e4f0b-e7de-4bcb-a774-3f44624c2d20', '采集caiji', 'card_vendor', 'order', '399bcea5-d120-499a-a78f-24ad085b96cd', 78.75, -8354.45, -8275.7, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-26 15:43:01.000000+00'),
  ('c2fa5696-b570-414d-932d-5a65773c37c6', '采集caiji', 'card_vendor', 'order', 'bb55ff37-af03-434a-9fae-fb550be128c2', 108.0, -8275.7, -8167.7, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-26 19:58:52.000000+00'),
  ('026bbefc-e8af-4ab3-945a-b2523e009ec1', '采集caiji', 'card_vendor', 'order', '587abffb-6830-4a5b-83ee-e0c4b8ffab50', 804.0, -8167.7, -7363.7, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-26 20:00:27.000000+00'),
  ('5357136d-29d7-4567-8193-fdde6186a128', '采集caiji', 'card_vendor', 'order', '94b42555-a4b1-49d4-a522-a5eca41fb05c', 3010.0, -7363.7, -4353.7, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-26 20:04:44.000000+00'),
  ('6ae06955-5322-4e83-8167-3b049ebae15c', '采集caiji', 'card_vendor', 'order', '27dbfcce-b874-496c-aed8-49949aa0f710', 112.6, -4353.7, -4241.1, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-26 20:22:41.000000+00'),
  ('1d655052-46c7-422f-8854-72e400bbb2e9', '采集caiji', 'card_vendor', 'order', '7ee5a957-e51f-4abf-ba6d-c4778bfc0e7b', 200.0, -4241.1, -4041.1, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-26 20:26:10.000000+00'),
  ('3a82fc44-0f27-4c6e-a05c-0bc43cc01e3c', '采集caiji', 'card_vendor', 'order', 'fa62751f-d8c0-421a-bfea-afe6e6e27b88', 237.0, -4041.1, -3804.1, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-26 20:29:39.000000+00'),
  ('7e7bb58b-d139-4bdc-b34c-1875caad0deb', '采集caiji', 'card_vendor', 'order', '6e14d7f6-2f4e-4621-8490-367bdf22f219', 54.0, -3804.1, -3750.1, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-26 21:41:52.000000+00'),
  ('360d74ab-30cc-465b-a4f6-1ae13f9b173f', '采集caiji', 'card_vendor', 'order', '663be7c9-3b76-4d2d-962b-a48aadec5ebc', 37.0, -3750.1, -3713.1, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-27 05:19:10.000000+00'),
  ('d9f5625e-82d0-4200-93cc-dbcdf323ef15', '采集caiji', 'card_vendor', 'initial_balance', NULL, 10975.32, -3713.1, 7262.22, true, NULL, '设置初始余额: 采集caiji = 7262.22', NULL, NULL, '2026-02-27 09:36:06.000000+00'),
  ('d9fead2f-626a-453f-a595-c2483bf62a7d', '采集caiji', 'card_vendor', 'order', 'd6d71f56-8224-46c9-afdf-b2725363a3ba', 79.5, 7262.22, 7341.72, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-27 14:34:45.000000+00'),
  ('af853cfb-c00f-47b3-9575-9b4b972f6af0', '采集caiji', 'card_vendor', 'order', '63bd4dbc-4bf9-4812-bf80-66f2c0634b92', 1030.0, 7341.72, 8371.72, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-27 17:48:36.000000+00'),
  ('b63a7043-ab83-47ca-84e0-b089e3f1c16d', '采集caiji', 'card_vendor', 'order', 'f3e2c1bd-9c03-47b4-8b98-6827da85fb90', 2408.0, 8371.72, 10779.72, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-27 17:49:41.000000+00'),
  ('c1ac1f2f-ddca-4701-9818-e8765b6a17e1', '采集caiji', 'card_vendor', 'order', 'a34f93e4-e0aa-493b-a1c8-a8f793524234', 3010.0, 10779.72, 13789.72, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-27 18:11:25.000000+00'),
  ('41b7f9ba-b4e4-4e26-8f25-bf53e7512015', '采集caiji', 'card_vendor', 'order', 'd1c20a55-7941-4f47-a4c8-96e47c6a9bcd', 57.0, 13789.72, 13846.72, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-27 19:21:35.000000+00'),
  ('fc57d442-4dbf-4ba3-90d7-0df6d6474e3e', '采集caiji', 'card_vendor', 'order', 'c8d1b395-f43f-412d-bf81-1226970203df', 4200.0, 13846.72, 18046.72, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-27 21:46:30.000000+00'),
  ('b9d0b175-e399-4e0f-8830-6e4000b8520f', '采集caiji', 'card_vendor', 'order', 'a120c8cb-d0b5-44bc-ab61-a8e6c6b44d9a', 281.5, 18046.72, 18328.22, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-27 23:57:22.000000+00'),
  ('076691dc-dbd4-40c8-aaa8-d81e29ce04b2', '采集caiji', 'card_vendor', 'withdrawal', 'WD_1772249668750_px4b', -20760.0, 18328.22, -2431.78, true, NULL, '录入卡商提款: 采集caiji - 20760', NULL, NULL, '2026-02-28 03:34:30.000000+00'),
  ('539e11f1-bfc5-4ccc-917b-e0587168144d', '采集caiji', 'card_vendor', 'order', '68458786-5781-4d51-983b-d33220f73bad', 582.0, -2431.78, -1849.78, true, NULL, '订单收入: ?', NULL, NULL, '2026-02-28 05:18:23.000000+00');

-- 修正已有账本记录的余额（该记录之前缺失了66条，导致余额错误）
UPDATE ledger_transactions
SET
  before_balance = -1849.78,
  after_balance = -534.78
WHERE id = '22ab8591-d1ba-49da-90dd-278364b2abd9';