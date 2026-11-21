<?php
/** Real WordPress, isolated database; no provider calls. */
function review_assert($condition, $message) { if (!$condition) { throw new RuntimeException($message); } }
$admin = get_user_by('login', 'fixture_admin');
review_assert((bool) $admin, 'fixture administrator missing');
wp_set_current_user($admin->ID);
$id = wp_insert_post(array('post_type'=>'ma_hotel_job','post_status'=>'draft','post_title'=>'مراجعة تجريبية'), true);
review_assert(!is_wp_error($id) && $id, 'draft creation failed');
update_post_meta($id, '_ma_job_ar_ready', '0');
update_post_meta($id, '_ma_job_verified_on', '2026-11-01');
do_action('add_meta_boxes_ma_hotel_job', get_post($id));
ob_start(); do_meta_boxes('ma_hotel_job', 'side', get_post($id)); $ui=ob_get_clean();
review_assert(strpos($ui, 'mah_lite_ar_ready') !== false, 'editorial review control missing');
$review_nonce = wp_create_nonce('mah_jobs_lite_review_' . $id);
$_POST = array('mah_lite_ar_ready'=>'1');
do_action('save_post_ma_hotel_job', $id);
review_assert(get_post_meta($id, '_ma_job_ar_ready', true) === '0', 'missing nonce accepted');
$_POST['mah_jobs_lite_review_nonce'] = 'invalid';
do_action('save_post_ma_hotel_job', $id);
review_assert(get_post_meta($id, '_ma_job_ar_ready', true) === '0', 'invalid nonce accepted');
$_POST['mah_jobs_lite_review_nonce'] = $review_nonce;
if (getenv('LITE_TEST_COEXIST') === '1') {
    review_assert(class_exists('MA_Hotels_Jobs'), 'legacy fixture missing');
    do_action('save_post_ma_hotel_job', $id);
    review_assert(get_post_meta($id, '_ma_job_ar_ready', true) === '0', 'Lite changed review status during coexistence');
    echo "manual review coexistence: PASS\n";
    return;
}
$subscriber = wp_create_user('review_subscriber', 'fixture-password', 'review-subscriber@example.test');
wp_set_current_user($subscriber);
$_POST['mah_jobs_lite_review_nonce'] = wp_create_nonce('mah_jobs_lite_review_' . $id);
do_action('save_post_ma_hotel_job', $id);
review_assert(get_post_meta($id, '_ma_job_ar_ready', true) === '0', 'unauthorized account changed review');
$editor = wp_create_user('review_editor', 'fixture-password', 'review-editor@example.test');
$user = new WP_User($editor); $user->set_role('editor');
wp_set_current_user($editor);
$_POST['mah_jobs_lite_review_nonce'] = wp_create_nonce('mah_jobs_lite_review_' . $id);
do_action('save_post_ma_hotel_job', $id);
review_assert(get_post_meta($id, '_ma_job_ar_ready', true) === '1', 'editor review did not save');
review_assert(get_post_meta($id, '_ma_job_verified_on', true) === '2026-11-01', 'review changed source verification date');
review_assert(get_post_status($id) === 'draft', 'review published the job');
$_POST['mah_lite_ar_ready'] = 'bad';
do_action('save_post_ma_hotel_job', $id);
review_assert(get_post_meta($id, '_ma_job_ar_ready', true) === '1', 'invalid value changed review');
$_POST['mah_lite_ar_ready'] = '0';
do_action('save_post_ma_hotel_job', $id);
review_assert(get_post_meta($id, '_ma_job_ar_ready', true) === '0', 'editor could not revoke review');
$_POST = array();
do_action('save_post_ma_hotel_job', $id);
review_assert(get_post_meta($id, '_ma_job_ar_ready', true) === '0', 'partial save changed review');
echo "manual review permissions and state: PASS\n";
