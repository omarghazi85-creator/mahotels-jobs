<?php
defined('ABSPATH') || exit;

// Explicit editorial decision only; never infer readiness from automated drafts.
add_action('add_meta_boxes_ma_hotel_job', function () {
    if (class_exists('MA_Hotels_Jobs')) { return; }
    add_meta_box('mah_jobs_lite_review', 'المراجعة التحريرية', function ($post) {
        if (!current_user_can('edit_others_posts') || !current_user_can('edit_post', $post->ID)) { return; }
        wp_nonce_field('mah_jobs_lite_review_' . $post->ID, 'mah_jobs_lite_review_nonce');
        $ready = get_post_meta($post->ID, '_ma_job_ar_ready', true) === '1';
        echo '<p><label for="mah-lite-ar-ready">' . esc_html('مراجعة الصياغة العربية') . '</label><br>';
        echo '<select id="mah-lite-ar-ready" name="mah_lite_ar_ready">';
        echo '<option value="0" ' . selected($ready, false, false) . '>' . esc_html('لم تعتمد بعد') . '</option>';
        echo '<option value="1" ' . selected($ready, true, false) . '>' . esc_html('راجعت الصياغة واعتمدتها') . '</option></select></p>';
        echo '<p>' . esc_html('بعد التحقق من المصدر، أدخل تاريخ التحقق في صندوق تفاصيل الوظيفة. الاعتماد وحده لا ينشر الوظيفة ولا يضمن فهرستها.') . '</p>';
    }, 'ma_hotel_job', 'side', 'default');
});
add_action('save_post_ma_hotel_job', function ($id) {
    if (class_exists('MA_Hotels_Jobs') || (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) ||
        wp_is_post_revision($id) || wp_is_post_autosave($id) ||
        !current_user_can('edit_others_posts') || !current_user_can('edit_post', $id) ||
        !isset($_POST['mah_jobs_lite_review_nonce'], $_POST['mah_lite_ar_ready']) ||
        !is_string($_POST['mah_jobs_lite_review_nonce']) || !is_string($_POST['mah_lite_ar_ready'])) { return; }
    $nonce = sanitize_text_field(wp_unslash($_POST['mah_jobs_lite_review_nonce']));
    $value = wp_unslash($_POST['mah_lite_ar_ready']);
    if (!wp_verify_nonce($nonce, 'mah_jobs_lite_review_' . $id) || !in_array($value, array('0','1'), true)) { return; }
    update_post_meta($id, '_ma_job_ar_ready', $value);
});
